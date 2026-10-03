-- Cierra casos de entradas NUMERIC especiales enviados directamente a RPC.
do $$ declare r record; begin
for r in select c.table_name,c.column_name from information_schema.columns c join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name where c.table_schema='public' and c.data_type='numeric' and t.table_type='BASE TABLE' loop
execute format('alter table public.%I add constraint %I check (%I is null or %I<>''NaN''::numeric)',r.table_name,r.table_name||'_'||r.column_name||'_finite',r.column_name,r.column_name);
end loop;
end $$;

-- RLS privadas de denegación explícita. Solo funciones autorizadas acceden a estas tablas.
create policy deny_direct on private.requests for all to authenticated using(false) with check(false);
create policy deny_direct on private.platform_admins for all to authenticated using(false) with check(false);

create table public.subscriptions (
 business_id uuid primary key references public.businesses(id), plan text not null, amount numeric(18,2) not null check(amount>=0 and amount<>'NaN'::numeric),
 starts_on date not null, ends_on date not null, status text not null check(status in ('trial','active','expired','canceled')), check(ends_on>=starts_on)
);
create table public.service_payments (
 id uuid primary key default gen_random_uuid(),business_id uuid not null references public.businesses(id),amount numeric(18,2) not null check(amount>0 and amount<>'NaN'::numeric),
 paid_on date not null,reference text not null,user_id uuid not null references auth.users(id),created_at timestamptz not null default now()
);
alter table public.subscriptions enable row level security;
alter table public.service_payments enable row level security;
create policy admin_read on public.subscriptions for select to authenticated using(private.allowed(business_id,'settings.write'));
create policy admin_read on public.service_payments for select to authenticated using(private.allowed(business_id,'settings.write'));
grant select on public.subscriptions,public.service_payments to authenticated;
revoke insert,update,delete on public.subscriptions,public.service_payments from authenticated,anon;

alter function private.platform(text,jsonb) rename to core_platform;
create function private.platform(a text,d jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from private.platform_admins where user_id=auth.uid()) then raise exception 'APP:Acceso de plataforma no autorizado.'; end if;
 if a='subscription' then
 insert into public.subscriptions(business_id,plan,amount,starts_on,ends_on,status) values((d->>'business_id')::uuid,d->>'plan',(d->>'amount')::numeric,(d->>'starts_on')::date,(d->>'ends_on')::date,d->>'status')
 on conflict(business_id) do update set plan=excluded.plan,amount=excluded.amount,starts_on=excluded.starts_on,ends_on=excluded.ends_on,status=excluded.status;
 elsif a='service_payment' then
 insert into public.service_payments(id,business_id,amount,paid_on,reference,user_id) values((d->>'id')::uuid,(d->>'business_id')::uuid,(d->>'amount')::numeric,(d->>'paid_on')::date,d->>'reference',auth.uid()) on conflict(id) do nothing;
 elsif a='detail' then return jsonb_build_object('subscription',(select to_jsonb(s) from public.subscriptions s where business_id=(d->>'business_id')::uuid),'payments',(select coalesce(jsonb_agg(to_jsonb(p) order by paid_on desc),'[]') from public.service_payments p where business_id=(d->>'business_id')::uuid));
 else return private.core_platform(a,d);
 end if;
 insert into public.audit_log(business_id,user_id,action,data) values((d->>'business_id')::uuid,auth.uid(),'platform.'||a,d);
 return jsonb_build_object('ok',true);
end $$;
revoke all on function private.core_platform(text,jsonb),private.platform(text,jsonb) from public,anon,authenticated;
grant execute on function private.platform(text,jsonb) to authenticated;

-- Costos de ajustes y creación de catálogo solo por usuarios autorizados.
alter function private.run_command(uuid,text,jsonb) rename to transactional_command;
create function private.run_command(b uuid,action text,d jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; v_branch uuid; v_today date;
begin
 if action='product.save' then
 perform private.require(b,'products.write');
 perform pg_advisory_xact_lock(hashtextextended(b::text||coalesce(d->>'code',''),0));
 if d->>'id' is null and exists(select 1 from public.products where business_id=b and code=d->>'code') then raise exception 'APP:Este código ya existe. La operación no sobrescribe productos.'; end if;
 elsif action='inventory.adjust' and d->>'cost' is not null and not private.allowed(b,'cost.read') then raise exception 'APP:No tienes permiso para cambiar el costo del inventario.';
 elsif action='expense.attach' then
 perform private.require(b,'expense.write');
 if split_part(d->>'path','/',1)<>b::text or split_part(d->>'path','/',2)<>'documents' then raise exception 'APP:Archivo no autorizado.'; end if;
 update public.expenses set proof_path=d->>'path' where business_id=b and id=(d->>'id')::uuid;
 return jsonb_build_object('id',d->>'id');
 end if;
 result=private.transactional_command(b,action,d);
 if action='employee.save' and coalesce((d->>'schedule')::boolean,false) then
 perform private.require(b,'users.write');
 v_branch=(d->>'branch_id')::uuid;
 select (now() at time zone timezone)::date into v_today from public.businesses where id=b;
 insert into public.expense_rules(business_id,branch_id,description,category,amount,frequency,next_date,day_of_month)
 values(b,v_branch,'Salario · '||(d->>'name'),'Nómina',(d->>'salary')::numeric,d->>'frequency',coalesce((d->>'next_date')::date,v_today),extract(day from coalesce((d->>'next_date')::date,v_today)));
 end if;
 return result;
end $$;
revoke all on function private.transactional_command(uuid,text,jsonb),private.run_command(uuid,text,jsonb) from public,anon,authenticated;

-- Cada FK tiene índice del lado referenciante para búsquedas y verificaciones.
do $$ declare r record; cols text; begin
for r in select c.conname,c.conrelid,c.conkey from pg_constraint c join pg_namespace n on n.oid=c.connamespace where c.contype='f' and n.nspname='public' loop
select string_agg(quote_ident(a.attname),',' order by k.ord) into cols from unnest(r.conkey) with ordinality k(attnum,ord) join pg_attribute a on a.attrelid=r.conrelid and a.attnum=k.attnum;
execute format('create index if not exists %I on %s(%s)',left(r.conname||'_lookup',63),r.conrelid::regclass,cols);
end loop;
end $$;
 create or replace function private.core_run_command(b uuid,action text,d jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare id uuid=coalesce((d->>'id')::uuid,gen_random_uuid()); br uuid; w uuid; p uuid; acc uuid; origin uuid;
 doc public.documents; l public.document_lines; s public.stock; sess public.sessions; tr public.transfers; e public.expenses;
 r jsonb; q numeric; c numeric; amount numeric; total numeric; debt numeric; refund numeric; old_cost numeric; target numeric;
 role text; nm text; obj text; day integer; state text;
begin
 if auth.uid() is null then raise exception 'APP:Inicia sesión para continuar.'; end if;
 perform private.require(b,'read');
 case action
 when 'document.create' then return private.create_document(b,d);
 when 'product.save' then
 perform private.require(b,'products.write');
 if not exists(select 1 from public.products where business_id=b and products.id=id) and exists(select 1 from public.products where products.id=id) then raise exception 'APP:Producto no disponible.'; end if;
 insert into public.products(id,business_id,code,barcode,name,description,category,brand,unit,fractional,price,wholesale_price,minimum,location,tax_rate,attributes,warranty_days,active,supplier_id)
 values(id,b,d->>'code',nullif(d->>'barcode',''),d->>'name',coalesce(d->>'description',''),coalesce(d->>'category',''),coalesce(d->>'brand',''),coalesce(d->>'unit','unidad'),coalesce((d->>'fractional')::boolean,false),(d->>'price')::numeric,(d->>'wholesale_price')::numeric,coalesce((d->>'minimum')::numeric,0),coalesce(d->>'location',''),coalesce((d->>'tax_rate')::numeric,0),coalesce(d->'attributes','{}'),coalesce((d->>'warranty_days')::integer,0),coalesce((d->>'active')::boolean,true),(d->>'supplier_id')::uuid)
 on conflict on constraint products_pkey do update set code=excluded.code,name=excluded.name,barcode=excluded.barcode,description=excluded.description,category=excluded.category,brand=excluded.brand,unit=excluded.unit,fractional=excluded.fractional,price=excluded.price,wholesale_price=excluded.wholesale_price,minimum=excluded.minimum,location=excluded.location,tax_rate=excluded.tax_rate,attributes=excluded.attributes,warranty_days=excluded.warranty_days,active=excluded.active,supplier_id=excluded.supplier_id where products.business_id=b returning products.id into id;
 insert into public.presentations(business_id,product_id,name,factor,price) values(b,id,'Unidad base',1,(d->>'price')::numeric)
 on conflict(business_id,product_id,name) do update set price=excluded.price;
 when 'presentation.save' then
 perform private.require(b,'products.write');
 insert into public.presentations(business_id,product_id,name,factor,price) values(b,(d->>'product_id')::uuid,d->>'name',(d->>'factor')::numeric,(d->>'price')::numeric)
 on conflict(business_id,product_id,name) do update set factor=excluded.factor,price=excluded.price;
 when 'price_rule.save' then
 perform private.require(b,'price.write');
 insert into public.price_rules(business_id,product_id,party_id,min_quantity,price) values(b,(d->>'product_id')::uuid,(d->>'party_id')::uuid,(d->>'min_quantity')::numeric,(d->>'price')::numeric);
 when 'party.save' then
 perform private.require(b,'parties.write');
 insert into public.parties(id,business_id,kind,name,phone,email,address,tax_id,price_level,credit_limit,credit_days)
 values(id,b,d->>'kind',d->>'name',coalesce(d->>'phone',''),coalesce(d->>'email',''),coalesce(d->>'address',''),coalesce(d->>'tax_id',''),coalesce(d->>'price_level','public'),coalesce((d->>'credit_limit')::numeric,0),coalesce((d->>'credit_days')::integer,30))
 on conflict on constraint parties_pkey do update set name=excluded.name,phone=excluded.phone,email=excluded.email,address=excluded.address,tax_id=excluded.tax_id,price_level=excluded.price_level,credit_limit=excluded.credit_limit,credit_days=excluded.credit_days where parties.business_id=b;
 when 'purchase.confirm' then
 perform private.require(b,'purchase.write');
 update public.documents set state='confirmed' where business_id=b and documents.id=id and kind='purchase' and documents.state='draft';
 if not found then raise exception 'APP:La orden no se puede confirmar.'; end if;
 when 'purchase.receive' then
 perform private.require(b,'purchase.receive');
 select * into doc from public.documents where business_id=b and documents.id=id and kind='purchase' and documents.state='confirmed' for update;
 if not found then raise exception 'APP:Confirma la orden antes de recibir.'; end if;
 select sum(base_quantity) into total from public.document_lines where document_id=doc.id;
 for r in select x from jsonb_array_elements(d->'lines') x order by x->>'line_id' loop
 select * into l from public.document_lines where business_id=b and document_id=doc.id and document_lines.id=(r->>'line_id')::uuid for update;
 q=(r->>'quantity')::numeric;
 if l.id is null or q<=0 or q>l.base_quantity-l.received then raise exception 'APP:La recepción supera la cantidad pendiente.'; end if;
 if exists(select 1 from public.products where products.id=l.product_id and not fractional) and trunc(q)<>q then raise exception 'APP:Este producto requiere unidades enteras.'; end if;
 select unit_cost into c from public.line_costs where line_id=l.id;
 perform pg_advisory_xact_lock(hashtextextended(b::text||doc.warehouse_id::text||l.product_id::text,0));
 perform private.stock_move(b,doc.warehouse_id,l.product_id,q,c+doc.extra_cost/total,'purchase',doc.id);
 update public.document_lines set received=received+q where document_lines.id=l.id;
 end loop;
 when 'payment.create' then
 perform private.require(b,'payment.write');
 id=private.record_payment(b,(d->>'branch_id')::uuid,(d->>'party_id')::uuid,d->>'direction',d->'payments',d->'applications');
 when 'cash.open' then
 perform private.require(b,'cash.write');
 select branch_id into br from public.accounts where business_id=b and accounts.id=(d->>'account_id')::uuid and kind='cash' and active;
 if br is null then raise exception 'APP:Selecciona una caja de efectivo activa.'; end if;
 insert into public.sessions(id,business_id,branch_id,account_id,user_id,opening) values(id,b,br,(d->>'account_id')::uuid,auth.uid(),(d->>'opening')::numeric);
 when 'cash.close' then
 perform private.require(b,'cash.write');
 select * into sess from public.sessions where business_id=b and sessions.id=id and user_id=auth.uid() and closed_at is null for update;
 if not found then raise exception 'APP:Este turno ya está cerrado o pertenece a otro usuario.'; end if;
 select sess.opening+coalesce(sum(m.amount),0) into total from public.money_moves m where session_id=sess.id;
 amount=(d->>'counted')::numeric;
 if amount<0 or (amount<>total and length(trim(coalesce(d->>'reason','')))<3) then raise exception 'APP:Explica la diferencia entre el saldo esperado y el conteo.'; end if;
 update public.sessions set closed_at=now(),expected=total,counted=amount,reason=coalesce(d->>'reason','') where sessions.id=id;
 when 'money.transfer' then
 perform private.require(b,'cash.write');
 if d->>'from_account'=d->>'to_account' then raise exception 'APP:Selecciona dos cuentas diferentes.'; end if;
 amount=(d->>'amount')::numeric;
 if amount<=0 then raise exception 'APP:Indica un importe mayor que cero.'; end if;
 perform private.money_move(b,(d->>'from_account')::uuid,-amount,'transfer',id,coalesce(d->>'reference',''));
 perform private.money_move(b,(d->>'to_account')::uuid,amount,'transfer',id,coalesce(d->>'reference',''));
 when 'inventory.adjust' then
 perform private.require(b,'inventory.write');
 w=(d->>'warehouse_id')::uuid; p=(d->>'product_id')::uuid;
 if length(trim(coalesce(d->>'reason','')))<3 then raise exception 'APP:Escribe el motivo del ajuste o conteo.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(b::text||w::text||p::text,0));
 select * into s from public.stock where business_id=b and warehouse_id=w and product_id=p for update;
 select average into c from public.stock_costs where business_id=b and warehouse_id=w and product_id=p;
 if d->>'counted' is not null then q=(d->>'counted')::numeric-coalesce(s.physical,0); else q=(d->>'quantity')::numeric; end if;
 if exists(select 1 from public.products where products.id=p and business_id=b and not fractional) and trunc(q)<>q then raise exception 'APP:Este producto requiere unidades enteras.'; end if;
 perform private.stock_move(b,w,p,q,coalesce((d->>'cost')::numeric,c,0),'adjustment',id,d->>'reason',coalesce((d->>'damaged')::numeric,0));
 when 'inventory.transfer' then
 perform private.require(b,'inventory.write');
 w=(d->>'from_warehouse')::uuid; p=(d->>'product_id')::uuid; q=(d->>'quantity')::numeric;
 if q<=0 then raise exception 'APP:Indica una cantidad positiva.'; end if;
 select average into c from public.stock_costs where business_id=b and warehouse_id=w and product_id=p;
 insert into public.transfers(id,business_id,from_warehouse,to_warehouse,product_id,quantity,unit_cost,user_id) values(id,b,w,(d->>'to_warehouse')::uuid,p,q,coalesce(c,0),auth.uid());
 perform pg_advisory_xact_lock(hashtextextended(b::text||w::text||p::text,0));
 perform private.stock_move(b,w,p,-q,0,'transfer_out',id);
 when 'inventory.receive_transfer' then
 perform private.require(b,'inventory.write');
 select * into tr from public.transfers where business_id=b and transfers.id=id and received_at is null for update;
 if not found then raise exception 'APP:Este traslado ya fue recibido.'; end if;
 perform private.stock_move(b,tr.to_warehouse,tr.product_id,tr.quantity,tr.unit_cost,'transfer_in',id);
 update public.transfers set received_at=now() where transfers.id=id;
 when 'return.create' then
 perform private.require(b,'return.write');
 select * into doc from public.documents where business_id=b and documents.id=(d->>'document_id')::uuid and kind in ('sale','purchase') and documents.state='confirmed' for update;
 select * into l from public.document_lines where business_id=b and document_id=doc.id and document_lines.id=(d->>'line_id')::uuid for update;
 q=(d->>'quantity')::numeric;
 if l.id is null or q<=0 or q>l.base_quantity-l.returned or (doc.kind='purchase' and q>l.received-l.returned) or length(trim(coalesce(d->>'reason','')))<3 then raise exception 'APP:Revisa la cantidad y el motivo de devolución.'; end if;
 if exists(select 1 from public.products where products.id=l.product_id and not fractional) and trunc(q)<>q then raise exception 'APP:Este producto requiere unidades enteras.'; end if;
 amount=round(l.total*q/l.base_quantity,2);
 if q=l.base_quantity-l.returned then amount=l.total-coalesce((select sum(returns.amount) from public.returns where line_id=l.id),0); end if;
 select balance into debt from public.document_balances where document_balances.id=doc.id;
 refund=greatest(amount-debt,0);
 insert into public.returns(id,business_id,document_id,line_id,quantity,amount,damaged,reason,user_id) values(id,b,doc.id,l.id,q,amount,coalesce((d->>'damaged')::boolean,false),d->>'reason',auth.uid());
 select unit_cost into c from public.line_costs where line_id=l.id;
 perform pg_advisory_xact_lock(hashtextextended(b::text||doc.warehouse_id::text||l.product_id::text,0));
 perform private.stock_move(b,doc.warehouse_id,l.product_id,case when doc.kind='purchase' then -q when coalesce((d->>'damaged')::boolean,false) then 0 else q end,c,'return',id,d->>'reason',case when doc.kind='sale' and coalesce((d->>'damaged')::boolean,false) then q else 0 end);
 update public.document_lines set returned=returned+q where document_lines.id=l.id;
 if refund>0 then
 perform private.record_payment(b,doc.branch_id,doc.party_id,case when doc.kind='sale' then 'out' else 'in' end,
 jsonb_build_array(jsonb_build_object('account_id',d->>'account_id','amount',refund)),jsonb_build_array(jsonb_build_object('document_id',doc.id,'amount',refund)));
 end if;
 return jsonb_build_object('id',id,'refund',refund,'credit_adjustment',amount-refund);
 when 'delivery.create' then
 perform private.require(b,'delivery.write');
 select * into doc from public.documents where business_id=b and documents.id=(d->>'document_id')::uuid and kind='sale' and documents.state='confirmed' for update;
 select * into l from public.document_lines where business_id=b and document_id=doc.id and document_lines.id=(d->>'line_id')::uuid for update;
 q=(d->>'quantity')::numeric;
 if l.id is null or q<=0 or q>l.base_quantity-l.delivered-l.returned or length(trim(coalesce(d->>'contact','')))=0 then raise exception 'APP:Revisa la entrega pendiente e indica quién recibió.'; end if;
 insert into public.deliveries(id,business_id,document_id,line_id,quantity,contact,proof_path,user_id) values(id,b,doc.id,l.id,q,d->>'contact',d->>'proof_path',auth.uid());
 update public.document_lines set delivered=delivered+q where document_lines.id=l.id;
 when 'document.void' then
 perform private.require(b,'sale.void');
 select * into doc from public.documents where business_id=b and documents.id=id and documents.state='confirmed' and kind='sale' for update;
 if not found or exists(select 1 from public.returns where document_id=id) or exists(select 1 from public.deliveries where document_id=id) then raise exception 'APP:La venta no puede anularse; utiliza una devolución.'; end if;
 if length(trim(coalesce(d->>'reason','')))<3 then raise exception 'APP:Indica el motivo de anulación.'; end if;
 select paid into amount from public.document_balances where document_balances.id=id;
 for l in select * from public.document_lines where document_id=id order by product_id loop
 select unit_cost into c from public.line_costs where line_id=l.id;
 perform private.stock_move(b,doc.warehouse_id,l.product_id,l.base_quantity,c,'void',id,d->>'reason');
 end loop;
 if amount>0 then perform private.record_payment(b,doc.branch_id,doc.party_id,'out',jsonb_build_array(jsonb_build_object('account_id',d->>'account_id','amount',amount)),jsonb_build_array(jsonb_build_object('document_id',id,'amount',amount))); end if;
 update public.documents set state='void' where documents.id=id;
 when 'quote.state' then
 perform private.require(b,'quote.write');
 state=d->>'state';
 if state not in ('draft','sent','accepted','rejected','expired') then raise exception 'APP:Estado no válido.'; end if;
 update public.documents set state=state where business_id=b and documents.id=id and kind='quote';
 if not found then raise exception 'APP:Cotización no disponible.'; end if;
 when 'expense.save' then
 perform private.require(b,'expense.write');
 insert into public.expenses(id,business_id,branch_id,description,category,amount,due_date,beneficiary,proof_path,user_id) values(id,b,(d->>'branch_id')::uuid,d->>'description',d->>'category',(d->>'amount')::numeric,(d->>'due_date')::date,coalesce(d->>'beneficiary',''),d->>'proof_path',auth.uid());
 when 'expense.pay' then
 perform private.require(b,'expense.write');
 select * into e from public.expenses where business_id=b and expenses.id=id and paid_at is null for update;
 if not found then raise exception 'APP:El gasto ya fue pagado.'; end if;
 if not exists(select 1 from public.accounts where business_id=b and accounts.id=(d->>'account_id')::uuid and branch_id=e.branch_id) then raise exception 'APP:Selecciona una cuenta de la sucursal del gasto.'; end if;
 perform private.money_move(b,(d->>'account_id')::uuid,-e.amount,'expense',id);
 update public.expenses set paid_at=now() where expenses.id=id;
 when 'expense_rule.save' then
 perform private.require(b,'expense.write');
 insert into public.expense_rules(id,business_id,branch_id,description,category,amount,frequency,next_date,day_of_month) values(id,b,(d->>'branch_id')::uuid,d->>'description',d->>'category',(d->>'amount')::numeric,d->>'frequency',(d->>'next_date')::date,extract(day from (d->>'next_date')::date));
 when 'employee.save' then
 perform private.require(b,'users.write');
 insert into public.employees(id,business_id,name,salary,frequency,commission) values(id,b,d->>'name',(d->>'salary')::numeric,d->>'frequency',coalesce((d->>'commission')::numeric,0));
 when 'warranty.save' then
 perform private.require(b,'return.write');
 insert into public.warranties(id,business_id,line_id,serial,description,state) values(id,b,(d->>'line_id')::uuid,coalesce(d->>'serial',''),d->>'description',coalesce(d->>'state','received'))
 on conflict on constraint warranties_pkey do update set state=excluded.state,description=excluded.description where warranties.business_id=b;
 when 'settings.save' then
 perform private.require(b,'settings.write');
 if not exists(select 1 from pg_timezone_names where name=d->>'timezone') then raise exception 'APP:Zona horaria no válida.'; end if;
 update public.businesses set name=d->>'name',currency=d->>'currency',timezone=d->>'timezone',tax_id=coalesce(d->>'tax_id',''),phone=coalesce(d->>'phone',''),address=coalesce(d->>'address',''),max_discount=coalesce((d->>'max_discount')::numeric,10) where businesses.id=b;
 when 'structure.save' then
 perform private.require(b,'settings.write'); obj=d->>'kind'; nm=d->>'name';
 if obj='branch' then insert into public.branches(id,business_id,name) values(id,b,nm);
 elsif obj='warehouse' then insert into public.warehouses(id,business_id,branch_id,name) values(id,b,(d->>'branch_id')::uuid,nm);
 elsif obj='account' then insert into public.accounts(id,business_id,branch_id,name,kind,commission) values(id,b,(d->>'branch_id')::uuid,nm,d->>'account_kind',coalesce((d->>'commission')::numeric,0));
 else raise exception 'APP:Selecciona sucursal, bodega o cuenta.'; end if;
 when 'membership.save' then
 perform private.require(b,'users.write');
 role=d->>'role';
 if (d->>'user_id')::uuid=auth.uid() and (role<>'ADMIN' or not coalesce((d->>'active')::boolean,true)) then raise exception 'APP:No puedes quitar tu propio acceso de administrador.'; end if;
 insert into public.memberships(business_id,user_id,role,permissions,active) values(b,(d->>'user_id')::uuid,role,array(select jsonb_array_elements_text(coalesce(d->'permissions','[]'))),coalesce((d->>'active')::boolean,true))
 on conflict(business_id,user_id) do update set role=excluded.role,permissions=excluded.permissions,active=excluded.active;
 else raise exception 'APP:Acción no disponible.';
 end case;
 return jsonb_build_object('id',id);
end $$;
