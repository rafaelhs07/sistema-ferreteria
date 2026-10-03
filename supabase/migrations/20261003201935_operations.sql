create function private.record_payment(b uuid,br uuid,party uuid,direction text,parts jsonb,apps jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare id uuid=gen_random_uuid(); part jsonb; app jsonb; total numeric; doc public.documents; debt numeric;
begin
 select sum((x->>'amount')::numeric) into total from jsonb_array_elements(parts) x;
 if total is null or total<=0 then raise exception 'APP:Indica un importe de pago mayor que cero.'; end if;
 if total<>(select sum((x->>'amount')::numeric) from jsonb_array_elements(apps) x) then raise exception 'APP:El pago y sus aplicaciones deben coincidir.'; end if;
 insert into public.payments(id,business_id,branch_id,party_id,direction,amount,user_id) values(id,b,br,party,direction,total,auth.uid());
 for app in select x from jsonb_array_elements(apps) x order by x->>'document_id' loop
 select * into doc from public.documents where business_id=b and documents.id=(app->>'document_id')::uuid and state='confirmed' for update;
 if not found or doc.party_id is distinct from party or doc.branch_id<>br or doc.kind='quote' then raise exception 'APP:El documento no corresponde al cliente, sucursal o proveedor.'; end if;
 if (app->>'amount')::numeric<=0 then raise exception 'APP:Indica un abono positivo.'; end if;
 select balance into debt from public.document_balances where document_balances.id=doc.id;
 if (doc.kind='sale' and direction='in') or (doc.kind='purchase' and direction='out') then
 if (app->>'amount')::numeric>debt then raise exception 'APP:El abono supera el saldo pendiente.'; end if;
 end if;
 insert into public.payment_applications(business_id,payment_id,document_id,amount) values(b,id,doc.id,(app->>'amount')::numeric);
 end loop;
 for part in select x from jsonb_array_elements(parts) x loop
 if (part->>'amount')::numeric<=0 or round((part->>'amount')::numeric,2)<>(part->>'amount')::numeric then raise exception 'APP:Revisa el importe de pago.'; end if;
 if not exists(select 1 from public.accounts where business_id=b and accounts.id=(part->>'account_id')::uuid and branch_id=br) then raise exception 'APP:La cuenta no pertenece a esta sucursal.'; end if;
 perform private.money_move(b,(part->>'account_id')::uuid,(part->>'amount')::numeric*case when direction='in' then 1 else -1 end,case when direction='in' then 'collection' else 'supplier_payment' end,id,coalesce(part->>'reference',''));
 end loop;
 return id;
end $$;

-- El saldo es obligación menos pagos netos y devoluciones. Un reembolso revierte el cobro.
create or replace view public.document_balances with (security_invoker=true) as
 select d.id,d.business_id,d.branch_id,d.number,d.kind,d.state,d.party_id,d.total,d.due_date,d.created_at,
 coalesce((select sum(a.amount*case when (d.kind='sale' and p.direction='in') or (d.kind='purchase' and p.direction='out') then 1 else -1 end) from public.payment_applications a join public.payments p on p.id=a.payment_id where a.document_id=d.id),0) paid,
 coalesce((select sum(r.amount) from public.returns r where r.document_id=d.id),0) refunded,
 case when d.state='void' then 0 else d.total-coalesce((select sum(a.amount*case when (d.kind='sale' and p.direction='in') or (d.kind='purchase' and p.direction='out') then 1 else -1 end) from public.payment_applications a join public.payments p on p.id=a.payment_id where a.document_id=d.id),0)-coalesce((select sum(r.amount) from public.returns r where r.document_id=d.id),0) end balance
 from public.documents d;

create function private.create_document(b uuid,input jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare doc public.documents; line jsonb; p public.products; pr public.presentations; party public.parties;
 q numeric; factor numeric; price numeric; discount numeric; subtotal numeric; tax numeric; cost numeric; lineid uuid;
 sums numeric; paid numeric; debt numeric; limit_discount numeric; br uuid=(input->>'branch_id')::uuid; w uuid=(input->>'warehouse_id')::uuid;
 kind text=input->>'kind'; credit boolean=coalesce((input->>'credit')::boolean,false); policy_price numeric; pricing record; extra numeric=coalesce((input->>'extra_cost')::numeric,0);
begin
 perform private.require(b,case kind when 'sale' then 'sale.create' when 'purchase' then 'purchase.write' when 'quote' then 'quote.write' else 'invalid' end);
 if not exists(select 1 from public.warehouses where business_id=b and id=w and branch_id=br) then raise exception 'APP:La bodega no pertenece a esta sucursal.'; end if;
 if jsonb_array_length(input->'lines') not between 1 and 200 then raise exception 'APP:Agrega entre uno y 200 productos.'; end if;
 if input->>'party_id' is not null then
 select * into party from public.parties where business_id=b and id=(input->>'party_id')::uuid and active for update;
 if not found or (kind='purchase' and party.kind<>'supplier') or (kind<>'purchase' and party.kind<>'customer') then raise exception 'APP:Selecciona un cliente o proveedor válido.'; end if;
 end if;
 if kind='purchase' and party.id is null then raise exception 'APP:Selecciona el proveedor.'; end if;
 if credit and (party.id is null or input->>'due_date' is null) then raise exception 'APP:El crédito requiere cliente o proveedor y vencimiento.'; end if;
 if coalesce((input->>'transport')::numeric,0)<0 or extra<0 then raise exception 'APP:Los costos adicionales no pueden ser negativos.'; end if;
 select max_discount into limit_discount from public.businesses where id=b;
 insert into public.documents(business_id,branch_id,warehouse_id,kind,state,party_id,created_by,due_date,valid_until,deferred,address,notes,transport,extra_cost,origin_id)
 values(b,br,w,kind,case kind when 'sale' then 'confirmed' else 'draft' end,party.id,auth.uid(),(input->>'due_date')::date,(input->>'valid_until')::date,
 coalesce((input->>'deferred')::boolean,false),coalesce(input->>'address',''),coalesce(input->>'notes',''),coalesce((input->>'transport')::numeric,0),extra,(input->>'origin_id')::uuid) returning * into doc;
 -- Orden determinista y locks por producto/bodega; también serializa filas de stock que aún no existen.
 for line in select x from jsonb_array_elements(input->'lines') x order by x->>'product_id' loop
 select * into p from public.products where business_id=b and id=(line->>'product_id')::uuid and active for share;
 if not found then raise exception 'APP:El producto ya no está activo.'; end if;
 select * into pr from public.presentations where business_id=b and id=(line->>'presentation_id')::uuid and product_id=p.id and active for share;
 if not found then raise exception 'APP:La presentación no corresponde a este producto.'; end if;
 q=(line->>'quantity')::numeric; factor=pr.factor;
 if q<=0 or round(q,6)<>q or (not p.fractional and trunc(q*factor)<>q*factor) then raise exception 'APP:Revisa la cantidad; este producto no permite fracciones.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(b::text||w::text||p.id::text,0));
 discount=coalesce((line->>'discount')::numeric,0);
 select * into pricing from private.price_line(b,p.id,pr.id,q,party.id,(line->>'price')::numeric,discount,kind);
 price=pricing.price; subtotal=pricing.subtotal; tax=pricing.tax;
 select average into cost from public.stock_costs where business_id=b and warehouse_id=w and product_id=p.id;
 cost=coalesce(cost,0);
 insert into public.document_lines(business_id,document_id,product_id,presentation_id,product_name,presentation_name,quantity,factor,base_quantity,price,discount,tax_rate,subtotal,tax,total,delivered,serial,lot)
 values(b,doc.id,p.id,pr.id,p.name,pr.name,q,factor,q*factor,price,discount,p.tax_rate,subtotal,tax,subtotal+tax,
 case when kind='sale' and not doc.deferred then q*factor else 0 end,coalesce(line->>'serial',''),coalesce(line->>'lot','')) returning id into lineid;
 insert into public.line_costs(business_id,line_id,unit_cost) values(b,lineid,case when kind='purchase' then subtotal/(q*factor) else cost end);
 if kind='sale' then perform private.stock_move(b,w,p.id,-q*factor,0,'sale',doc.id); end if;
 end loop;
 select sum(l.subtotal),sum(l.tax),sum(l.total) into subtotal,tax,sums from public.document_lines l where document_id=doc.id;
 update public.documents set subtotal=subtotal,tax=tax,total=sums+transport+extra_cost where id=doc.id returning * into doc;
 select coalesce(sum((x->>'amount')::numeric),0) into paid from jsonb_array_elements(coalesce(input->'payments','[]')) x;
 if kind='sale' then
 if paid>doc.total or (not credit and paid<>doc.total) then raise exception 'APP:Los pagos deben cubrir la venta sin superar su total.'; end if;
 if credit then
 select coalesce(sum(balance),0) into debt from public.document_balances db where business_id=b and party_id=party.id and db.kind='sale' and state='confirmed' and id<>doc.id;
 if debt+doc.total-paid>party.credit_limit then raise exception 'APP:La venta supera el límite de crédito del cliente.'; end if;
 end if;
 if paid>0 then perform private.record_payment(b,br,party.id,'in',input->'payments',jsonb_build_array(jsonb_build_object('document_id',doc.id,'amount',paid))); end if;
 elsif paid<>0 then raise exception 'APP:Registra los pagos de compra después de confirmar la orden.';
 end if;
 return jsonb_build_object('id',doc.id,'number',doc.number,'total',doc.total);
end $$;

create function private.run_command(b uuid,action text,d jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
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
 on conflict(business_id,code) do update set name=excluded.name,barcode=excluded.barcode,description=excluded.description,category=excluded.category,brand=excluded.brand,unit=excluded.unit,fractional=excluded.fractional,price=excluded.price,wholesale_price=excluded.wholesale_price,minimum=excluded.minimum,location=excluded.location,tax_rate=excluded.tax_rate,attributes=excluded.attributes,warranty_days=excluded.warranty_days,active=excluded.active,supplier_id=excluded.supplier_id returning products.id into id;
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

create function private.command(b uuid,k uuid,a text,d jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare res jsonb; prev private.requests; payload jsonb=jsonb_build_object('action',a,'data',d);
begin
 if auth.uid() is null then raise exception 'APP:Inicia sesión.'; end if;
 perform private.require(b,'read');
 perform pg_advisory_xact_lock(hashtextextended(b::text||k::text,0));
 select * into prev from private.requests where business_id=b and request_id=k;
 if found then
 if prev.user_id<>auth.uid() or prev.payload<>payload then raise exception 'APP:El identificador de reintento corresponde a otra operación.'; end if;
 return prev.result;
 end if;
 res=private.run_command(b,a,d);
 insert into private.requests(business_id,request_id,user_id,payload,result) values(b,k,auth.uid(),payload,res);
 insert into public.audit_log(business_id,user_id,action,origin_id,data) values(b,auth.uid(),a,(res->>'id')::uuid,res);
 return res;
end $$;
create function public.command(p_business uuid,p_key uuid,p_action text,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.command(p_business,p_key,p_action,p_data) $$;

create function private.bootstrap(n text,k uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare b uuid; br uuid;
begin
 if auth.uid() is null or length(trim(n)) not between 1 and 200 then raise exception 'APP:Inicia sesión e indica el nombre del negocio.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,0));
 select business_id into b from public.memberships where user_id=auth.uid() and role='ADMIN' order by business_id limit 1;
 if found then return b; end if;
 insert into public.businesses(id,name) values(k,n) returning id into b;
 insert into public.memberships(business_id,user_id,role) values(b,auth.uid(),'ADMIN');
 insert into public.branches(business_id,name) values(b,'Principal') returning id into br;
 insert into public.warehouses(business_id,branch_id,name) values(b,br,'Bodega principal');
 insert into public.accounts(business_id,branch_id,name,kind) values(b,br,'Caja principal','cash'),(b,br,'Cuenta bancaria','bank'),(b,br,'Tarjetas','card');
 insert into public.audit_log(business_id,user_id,action) values(b,auth.uid(),'business.create');
 return b;
end $$;
create function public.bootstrap(p_name text,p_key uuid) returns uuid language sql security invoker set search_path='' as $$ select private.bootstrap(p_name,p_key) $$;

-- Periodicidad: 7 días, 14 días o mismo día de mes (clamp al último día). No paga automáticamente.
create function private.generate_expenses() returns integer language plpgsql security definer set search_path='' as $$
declare r public.expense_rules; today date; count integer=0; next_month date;
begin
 for r in select x.* from public.expense_rules x join public.businesses b on b.id=x.business_id where x.active and b.status='active' for update of x skip locked loop
 select (now() at time zone timezone)::date into today from public.businesses where id=r.business_id;
 while r.next_date<=today loop
 insert into public.expenses(business_id,branch_id,description,category,amount,due_date,rule_id) values(r.business_id,r.branch_id,r.description,r.category,r.amount,r.next_date,r.id) on conflict(rule_id,due_date) do nothing;
 count=count+1;
 if r.frequency='monthly' then
 next_month=(date_trunc('month',r.next_date)+interval '1 month')::date;
 r.next_date=next_month+least(r.day_of_month,extract(day from next_month+interval '1 month -1 day')::integer)-1;
 else r.next_date=r.next_date+case r.frequency when 'weekly' then 7 else 14 end; end if;
 end loop;
 update public.expense_rules set next_date=r.next_date where id=r.id;
 end loop;
 return count;
end $$;

revoke all on all functions in schema private from public,anon,authenticated;
grant execute on function private.allowed(uuid,text),private.require(uuid,text),private.command(uuid,uuid,text,jsonb),private.bootstrap(text,uuid) to authenticated;
revoke all on function public.command(uuid,uuid,text,jsonb),public.bootstrap(text,uuid) from public,anon;
grant execute on function public.command(uuid,uuid,text,jsonb),public.bootstrap(text,uuid) to authenticated;
