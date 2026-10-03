-- Evita mostrar costos de traslados y compras a usuarios sin ese permiso.
revoke select on public.transfers from authenticated;
grant select(id,business_id,from_warehouse,to_warehouse,product_id,quantity,received_at,user_id,created_at) on public.transfers to authenticated;
drop policy tenant_read on public.documents;
create policy tenant_read on public.documents for select to authenticated using(private.allowed(business_id,'documents.read') and (kind<>'purchase' or private.allowed(business_id,'cost.read') or private.allowed(business_id,'purchase.write')));
drop policy tenant_read on public.document_lines;
create policy tenant_read on public.document_lines for select to authenticated using(private.allowed(business_id,'documents.read') and exists(select 1 from public.documents d where d.id=document_id));
drop policy tenant_read on public.payments;
create policy tenant_read on public.payments for select to authenticated using(private.allowed(business_id,'documents.read'));

create function private.context() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; perms text[];
begin
 if auth.uid() is null then raise exception 'APP:Inicia sesión.'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'status',b.status,'currency',b.currency,'timezone',b.timezone,'role',m.role) order by b.name),'[]') into result
 from public.memberships m join public.businesses b on b.id=m.business_id where m.user_id=auth.uid() and m.active;
 return jsonb_build_object('businesses',result,'superadmin',exists(select 1 from private.platform_admins where user_id=auth.uid()));
end $$;
create function public.context() returns jsonb language sql security invoker set search_path='' as $$ select private.context() $$;

create function private.read_data(b uuid,entity text,term text default '',page integer default 0,filters jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare perm text; table_name text; result jsonb; columns text='t.*'; clause text=''; count integer; query text; br uuid=(filters->>'branch_id')::uuid; id uuid=(filters->>'id')::uuid; w uuid=(filters->>'warehouse_id')::uuid;
begin
 perform private.require(b,'read');
 if page<0 or page>100000 or length(term)>200 then raise exception 'APP:Búsqueda no válida.'; end if;
 select t,p into table_name,perm from (values
 ('products','products','products.read'),('presentations','presentations','products.read'),('stock','stock','products.read'),
 ('parties','parties','parties.read'),('documents','documents','documents.read'),('document_lines','document_lines','documents.read'),
 ('balances','document_balances','documents.read'),('sessions','sessions','money.read'),('money_moves','money_moves','money.read'),
 ('inventory_moves','inventory_moves','inventory.read'),('transfers','transfers','inventory.read'),('expenses','expenses','expense.write'),
 ('expense_rules','expense_rules','expense.write'),('employees','employees','users.write'),('warranties','warranties','documents.read'),
 ('memberships','memberships','users.write'),('audit','audit_log','users.write'),('returns','returns','documents.read'),('payments','payments','documents.read'),('deliveries','deliveries','documents.read')) a(e,t,p) where e=entity;
 if table_name is null then raise exception 'APP:Consulta no disponible.'; end if;
 perform private.require(b,perm);
 if entity='products' then
 columns='t.*, (select coalesce(jsonb_agg(to_jsonb(pr)),''[]'') from public.presentations pr where pr.product_id=t.id and pr.active) as presentations, (select coalesce(sum(s.physical-s.reserved),0) from public.stock s where s.product_id=t.id and ($5 is null or s.warehouse_id=$5)) as available';
 clause=' and (t.name ilike ''%''||$2||''%'' or t.code ilike ''%''||$2||''%'' or t.barcode=$2 or t.brand ilike ''%''||$2||''%'')';
 elsif entity='parties' then clause=' and t.name ilike ''%''||$2||''%''';
 elsif entity in ('expenses','expense_rules','employees','warranties') then clause=' and t.'||case entity when 'employees' then 'name' else 'description' end||' ilike ''%''||$2||''%''';
 end if;
 if entity in ('documents','balances','sessions','expenses','expense_rules','money_moves') then clause=clause||' and ($3 is null or t.branch_id=$3)'; end if;
 if entity in ('documents','balances','parties') and filters->>'kind' is not null then clause=clause||format(' and t.kind=%L',filters->>'kind'); end if;
 if entity in ('documents','balances') and filters->>'party_id' is not null then clause=clause||format(' and t.party_id=%L::uuid',filters->>'party_id'); end if;
 if entity='documents' and filters->>'state' is not null then clause=clause||format(' and t.state=%L',filters->>'state'); end if;
 if entity='documents' and filters->>'pending'='true' then clause=clause||' and t.state=''confirmed'' and exists(select 1 from public.document_lines l where l.document_id=t.id and l.base_quantity>l.delivered+l.returned)'; end if;
 if entity='document_lines' then clause=clause||' and t.document_id=$4';
 elsif id is not null then clause=clause||' and t.id=$4'; end if;
 if entity in ('inventory_moves','stock') then clause=clause||' and ($5 is null or t.warehouse_id=$5)'; end if;
 if entity in ('documents','balances') then
 if filters->>'from' is not null then clause=clause||format(' and t.created_at >= %L::date at time zone (select timezone from public.businesses where id=$1)',filters->>'from'); end if;
 if filters->>'to' is not null then clause=clause||format(' and t.created_at < (%L::date+1) at time zone (select timezone from public.businesses where id=$1)',filters->>'to'); end if;
 end if;
 query=format(' from public.%I t where t.business_id=$1%s',table_name,clause);
 execute 'select count(*)'||query into count using b,term,br,id,w;
 execute 'select coalesce(jsonb_agg(to_jsonb(x)),''[]'') from (select '||columns||query||' order by '||case when entity='memberships' then 't.user_id' when entity='stock' then 't.product_id' when entity in ('products','parties') then 't.name,t.id' when entity in ('documents','balances','money_moves','inventory_moves','payments','audit','returns','deliveries') then 't.created_at desc,t.id' else 't.id' end||' limit 25 offset '||(page*25)||') x' into result using b,term,br,id,w;
 -- Mask procurement values even in direct RPC calls.
 if not private.allowed(b,'cost.read') and not private.allowed(b,'purchase.write') then
 if entity='documents' then select coalesce(jsonb_agg(case when x->>'kind'='purchase' then x-'subtotal'-'tax'-'total'-'extra_cost' else x end),'[]') into result from jsonb_array_elements(result) x;
 elsif entity='document_lines' and exists(select 1 from public.documents where documents.id=id and kind='purchase') then select coalesce(jsonb_agg(x-'price'-'discount'-'subtotal'-'tax'-'total'),'[]') into result from jsonb_array_elements(result) x;
 elsif entity='transfers' then select coalesce(jsonb_agg(x-'unit_cost'),'[]') into result from jsonb_array_elements(result) x;
 elsif entity='balances' then select coalesce(jsonb_agg(x),'[]') into result from jsonb_array_elements(result) x where x->>'kind'<>'purchase'; end if;
 end if;
 return jsonb_build_object('rows',result,'count',count,'page',page);
end $$;
create function public.read_data(p_business uuid,p_entity text,p_term text default '',p_page integer default 0,p_filters jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select private.read_data(p_business,p_entity,p_term,p_page,p_filters) $$;

create function private.workspace(b uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare permissions jsonb;
begin
 perform private.require(b,'read');
 select jsonb_agg(p) into permissions from unnest(array['products.read','products.write','parties.read','parties.write','sale.create','quote.write','documents.read','purchase.write','purchase.receive','inventory.read','inventory.write','cost.read','price.write','discount.authorize','payment.write','cash.write','money.read','expense.write','return.write','sale.void','delivery.write','report.read','export','users.write','settings.write']) p where private.allowed(b,p);
 return jsonb_build_object('branches',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.branches x where business_id=b),
 'warehouses',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.warehouses x where business_id=b),
 'accounts',(select coalesce(jsonb_agg(to_jsonb(x)),'[]') from public.accounts x where business_id=b and active),'permissions',coalesce(permissions,'[]'),
 'settings',(select to_jsonb(x) from public.businesses x where id=b));
end $$;
create function public.workspace(p_business uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.workspace(p_business) $$;

create function private.report(b uuid,f date,t date,br uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare start_at timestamptz; end_at timestamptz; tz text; sales numeric; costs numeric; expenses numeric; fees numeric;
begin
 perform private.require(b,'report.read');
 if t<f or t-f>366 then raise exception 'APP:Selecciona un período de hasta un año.'; end if;
 select timezone into tz from public.businesses where id=b;
 start_at=f::timestamp at time zone tz; end_at=(t+1)::timestamp at time zone tz;
 select coalesce(sum(total),0) into sales from public.documents where business_id=b and kind='sale' and state='confirmed' and created_at>=start_at and created_at<end_at and (br is null or branch_id=br);
 select sales-coalesce(sum(r.amount),0) into sales from public.returns r join public.documents d on d.id=r.document_id where r.business_id=b and d.kind='sale' and r.created_at>=start_at and r.created_at<end_at and (br is null or d.branch_id=br);
 select coalesce(sum(l.base_quantity*c.unit_cost),0) into costs from public.document_lines l join public.documents d on d.id=l.document_id join public.line_costs c on c.line_id=l.id where d.business_id=b and d.kind='sale' and d.state='confirmed' and d.created_at>=start_at and d.created_at<end_at and (br is null or d.branch_id=br);
 select costs-coalesce(sum(r.quantity*c.unit_cost),0) into costs from public.returns r join public.documents d on d.id=r.document_id join public.line_costs c on c.line_id=r.line_id where r.business_id=b and d.kind='sale' and r.created_at>=start_at and r.created_at<end_at and (br is null or d.branch_id=br);
 select coalesce(sum(e.amount),0) into expenses from public.expenses e where business_id=b and due_date between f and t and (br is null or branch_id=br);
 select coalesce(-sum(amount),0) into fees from public.money_moves where business_id=b and kind='card_fee' and created_at>=start_at and created_at<end_at and (br is null or branch_id=br);
 return jsonb_build_object('sales',sales,'collections',(select coalesce(sum(case direction when 'in' then amount else -amount end),0) from public.payments p where business_id=b and created_at>=start_at and created_at<end_at and (br is null or branch_id=br) and exists(select 1 from public.payment_applications a join public.documents d on d.id=a.document_id where a.payment_id=p.id and d.kind='sale')),
 'costs',case when private.allowed(b,'cost.read') then costs else null end,'gross_margin',case when private.allowed(b,'cost.read') then sales-costs else null end,
 'expenses',expenses,'fees',fees,'operating_result',case when private.allowed(b,'cost.read') then sales-costs-expenses-fees else null end,
 'outflows',(select coalesce(-sum(amount),0) from public.money_moves where business_id=b and amount<0 and kind<>'transfer' and created_at>=start_at and created_at<end_at and (br is null or branch_id=br)),
 'cash',(select coalesce(sum(s.opening+coalesce((select sum(amount) from public.money_moves m where m.session_id=s.id),0)),0) from public.sessions s where business_id=b and closed_at is null and (br is null or branch_id=br)),
 'receivable',(select coalesce(sum(balance),0) from public.document_balances where business_id=b and kind='sale' and state='confirmed' and (br is null or branch_id=br)),
 'payable',(select coalesce(sum(balance),0) from public.document_balances where business_id=b and kind='purchase' and state='confirmed' and (br is null or branch_id=br)),
 'valuation',case when private.allowed(b,'cost.read') then (select coalesce(sum(s.physical*c.average),0) from public.stock s join public.stock_costs c using(business_id,warehouse_id,product_id) join public.warehouses w on w.id=s.warehouse_id where s.business_id=b and (br is null or w.branch_id=br)) else null end,
 'low_stock',(select coalesce(jsonb_agg(x),'[]') from (select p.id,p.name,p.minimum,coalesce(sum(s.physical-s.reserved),0) available from public.products p left join public.stock s on s.product_id=p.id and (br is null or s.warehouse_id in(select id from public.warehouses where branch_id=br)) where p.business_id=b and p.active group by p.id having coalesce(sum(s.physical-s.reserved),0)<=p.minimum order by available limit 10) x),
 'pending_deliveries',(select count(distinct d.id) from public.documents d join public.document_lines l on l.document_id=d.id where d.business_id=b and d.kind='sale' and d.state='confirmed' and l.base_quantity>l.delivered+l.returned and (br is null or d.branch_id=br)),
 'top_products',(select coalesce(jsonb_agg(x),'[]') from (select l.product_name,sum(l.base_quantity-l.returned) quantity,sum(l.total) total from public.document_lines l join public.documents d on d.id=l.document_id where d.business_id=b and d.kind='sale' and d.state='confirmed' and d.created_at>=start_at and d.created_at<end_at and (br is null or d.branch_id=br) group by l.product_name order by quantity desc limit 10) x),
 'aging',(select coalesce(jsonb_agg(x),'[]') from (select number,party_id,due_date,balance, greatest(f-due_date,0) days_overdue from public.document_balances where business_id=b and kind='sale' and state='confirmed' and balance>0 and (br is null or branch_id=br) order by due_date limit 100) x));
end $$;
create function public.report(p_business uuid,p_from date,p_to date,p_branch uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select private.report(p_business,p_from,p_to,p_branch) $$;

create function private.platform(a text,d jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from private.platform_admins where user_id=auth.uid()) then raise exception 'APP:Acceso de plataforma no autorizado.'; end if;
 if a='list' then return (select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'status',status,'created_at',created_at)),'[]') from public.businesses); end if;
 if a='status' and d->>'status' in ('active','suspended') then
 update public.businesses set status=d->>'status' where id=(d->>'business_id')::uuid;
 insert into public.audit_log(business_id,user_id,action,data) values((d->>'business_id')::uuid,auth.uid(),'platform.status',d);
 return jsonb_build_object('ok',true);
 end if;
 raise exception 'APP:Acción de plataforma no disponible.';
end $$;
create function public.platform(p_action text,p_data jsonb default '{}') returns jsonb language sql security invoker set search_path='' as $$ select private.platform(p_action,p_data) $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('business-files','business-files',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf']) on conflict(id) do nothing;
create policy files_read on storage.objects for select to authenticated using(bucket_id='business-files' and private.allowed((storage.foldername(name))[1]::uuid,'read'));
create policy files_insert on storage.objects for insert to authenticated with check(bucket_id='business-files' and private.allowed((storage.foldername(name))[1]::uuid,'products.write'));
-- Nuevos objetos por UUID: no upsert y no edición silenciosa de comprobantes.

revoke all on function private.context(),private.read_data(uuid,text,text,integer,jsonb),private.workspace(uuid),private.report(uuid,date,date,uuid),private.platform(text,jsonb) from public,anon;
grant execute on function private.context(),private.read_data(uuid,text,text,integer,jsonb),private.workspace(uuid),private.report(uuid,date,date,uuid),private.platform(text,jsonb) to authenticated;
revoke all on function public.context(),public.read_data(uuid,text,text,integer,jsonb),public.workspace(uuid),public.report(uuid,date,date,uuid),public.platform(text,jsonb) from public,anon;
grant execute on function public.context(),public.read_data(uuid,text,text,integer,jsonb),public.workspace(uuid),public.report(uuid,date,date,uuid),public.platform(text,jsonb) to authenticated;
