-- Refinamientos de reportes, catálogos relacionados y validación de movimientos.
alter table public.documents add column voided_at timestamptz;
alter table public.documents add column void_reason text;
create or replace view public.document_balances with (security_invoker=true) as
 select d.id,d.business_id,d.branch_id,d.number,d.kind,d.state,d.party_id,d.total,d.due_date,d.created_at,
 coalesce((select sum(a.amount*case when (d.kind='sale' and p.direction='in') or (d.kind='purchase' and p.direction='out') then 1 else -1 end) from public.payment_applications a join public.payments p on p.id=a.payment_id where a.document_id=d.id),0) paid,
 coalesce((select sum(r.amount) from public.returns r where r.document_id=d.id),0) refunded,
 case when d.state='void' then 0 else d.total-coalesce((select sum(a.amount*case when (d.kind='sale' and p.direction='in') or (d.kind='purchase' and p.direction='out') then 1 else -1 end) from public.payment_applications a join public.payments p on p.id=a.payment_id where a.document_id=d.id),0)-coalesce((select sum(r.amount) from public.returns r where r.document_id=d.id),0) end balance,d.created_by
 from public.documents d;
create function private.report(b uuid,f date,t date,br uuid,u uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare start_at timestamptz; end_at timestamptz; tz text; sales numeric; costs numeric; expenses numeric; fees numeric; taxes numeric; revenue numeric;
begin
 perform private.require(b,'report.read');
 if t<f or t-f>366 then raise exception 'APP:Selecciona un período de hasta un año.'; end if;
 select timezone into tz from public.businesses where id=b;
 start_at=f::timestamp at time zone tz; end_at=(t+1)::timestamp at time zone tz;
 select coalesce(sum(total),0) into sales from public.documents where business_id=b and kind='sale' and state in ('confirmed','void') and created_at>=start_at and created_at<end_at and (br is null or branch_id=br) and (u is null or created_by=u);
 select sales-coalesce(sum(r.amount),0) into sales from public.returns r join public.documents d on d.id=r.document_id where r.business_id=b and d.kind='sale' and r.created_at>=start_at and r.created_at<end_at and (br is null or d.branch_id=br) and (u is null or d.created_by=u);
 select coalesce(sum(l.base_quantity*c.unit_cost),0) into costs from public.document_lines l join public.documents d on d.id=l.document_id join public.line_costs c on c.line_id=l.id where d.business_id=b and d.kind='sale' and d.state in ('confirmed','void') and d.created_at>=start_at and d.created_at<end_at and (br is null or d.branch_id=br) and (u is null or d.created_by=u);
 select costs-coalesce(sum(case when r.damaged then 0 else r.quantity*c.unit_cost end),0) into costs from public.returns r join public.documents d on d.id=r.document_id join public.line_costs c on c.line_id=r.line_id where r.business_id=b and d.kind='sale' and r.created_at>=start_at and r.created_at<end_at and (br is null or d.branch_id=br) and (u is null or d.created_by=u);
 select coalesce(sum(e.amount),0) into expenses from public.expenses e where business_id=b and due_date between f and t and (br is null or branch_id=br) and (u is null or e.user_id=u);
 select coalesce(-sum(amount),0) into fees from public.money_moves where business_id=b and kind='card_fee' and created_at>=start_at and created_at<end_at and (br is null or branch_id=br) and (u is null or user_id=u);
 select coalesce(sum(d.tax),0) into taxes from public.documents d where d.business_id=b and d.kind='sale' and d.state in ('confirmed','void') and d.created_at>=start_at and d.created_at<end_at and (br is null or d.branch_id=br) and (u is null or d.created_by=u);
 select taxes-coalesce(sum(round(r.amount*l.tax/nullif(l.total,0),2)),0) into taxes from public.returns r join public.documents d on d.id=r.document_id join public.document_lines l on l.id=r.line_id where r.business_id=b and d.kind='sale' and r.created_at>=start_at and r.created_at<end_at and (br is null or d.branch_id=br) and (u is null or d.created_by=u);
 select sales-coalesce(sum(d.total),0),taxes-coalesce(sum(d.tax),0) into sales,taxes from public.documents d where d.business_id=b and d.kind='sale' and d.state='void' and d.voided_at>=start_at and d.voided_at<end_at and (br is null or d.branch_id=br) and (u is null or d.created_by=u);
 select costs-coalesce(sum(l.base_quantity*c.unit_cost),0) into costs from public.documents d join public.document_lines l on l.document_id=d.id join public.line_costs c on c.line_id=l.id where d.business_id=b and d.kind='sale' and d.state='void' and d.voided_at>=start_at and d.voided_at<end_at and (br is null or d.branch_id=br) and (u is null or d.created_by=u);
 revenue=sales-taxes;
 return jsonb_build_object('net_revenue',revenue,'taxes',taxes,'sales',sales,'collections',(select coalesce(sum(case direction when 'in' then amount else -amount end),0) from public.payments p where business_id=b and created_at>=start_at and created_at<end_at and (br is null or branch_id=br) and (u is null or p.user_id=u) and exists(select 1 from public.payment_applications a join public.documents d on d.id=a.document_id where a.payment_id=p.id and d.kind='sale')),
 'costs',case when private.allowed(b,'cost.read') then costs else null end,'gross_margin',case when private.allowed(b,'cost.read') then revenue-costs else null end,
 'expenses',expenses,'fees',fees,'operating_result',case when private.allowed(b,'cost.read') then revenue-costs-expenses-fees else null end,
 'outflows',(select coalesce(-sum(amount),0) from public.money_moves where business_id=b and amount<0 and kind<>'transfer' and created_at>=start_at and created_at<end_at and (br is null or branch_id=br) and (u is null or user_id=u)),
 'cash',(select coalesce(sum(s.opening+coalesce((select sum(amount) from public.money_moves m where m.session_id=s.id),0)),0) from public.sessions s where business_id=b and closed_at is null and (br is null or branch_id=br) and (u is null or s.user_id=u)),
 'receivable',(select coalesce(sum(balance),0) from public.document_balances where business_id=b and kind='sale' and state='confirmed' and (br is null or branch_id=br) and (u is null or created_by=u)),
 'payable',(select coalesce(sum(balance),0) from public.document_balances where business_id=b and kind='purchase' and state='confirmed' and (br is null or branch_id=br) and (u is null or created_by=u)),
 'valuation',case when private.allowed(b,'cost.read') then (select coalesce(sum(s.physical*c.average),0) from public.stock s join public.stock_costs c using(business_id,warehouse_id,product_id) join public.warehouses w on w.id=s.warehouse_id where s.business_id=b and (br is null or w.branch_id=br)) else null end,
 'low_stock',(select coalesce(jsonb_agg(x),'[]') from (select p.id,p.name,p.minimum,coalesce(sum(s.physical-s.reserved),0) available from public.products p left join public.stock s on s.product_id=p.id and (br is null or s.warehouse_id in(select id from public.warehouses where branch_id=br)) where p.business_id=b and p.active group by p.id having coalesce(sum(s.physical-s.reserved),0)<=p.minimum order by available limit 10) x),
 'pending_deliveries',(select count(distinct d.id) from public.documents d join public.document_lines l on l.document_id=d.id where d.business_id=b and d.kind='sale' and d.state='confirmed' and l.base_quantity>l.delivered+l.returned and (br is null or d.branch_id=br) and (u is null or d.created_by=u)),
 'top_products',(select coalesce(jsonb_agg(x),'[]') from (select l.product_name,sum(l.base_quantity-coalesce((select sum(r.quantity) from public.returns r where r.line_id=l.id and r.created_at<end_at),0)) quantity,sum(l.total-coalesce((select sum(r.amount) from public.returns r where r.line_id=l.id and r.created_at<end_at),0)) total from public.document_lines l join public.documents d on d.id=l.document_id where d.business_id=b and d.kind='sale' and d.state in ('confirmed','void') and d.created_at>=start_at and d.created_at<end_at and (br is null or d.branch_id=br) and (u is null or d.created_by=u) and (d.state<>'void' or d.voided_at>=end_at) group by l.product_name order by quantity desc limit 10) x),
 'payment_methods',(select coalesce(jsonb_agg(x),'[]') from (select a.name,a.kind,sum(m.amount) amount from public.money_moves m join public.accounts a on a.id=m.account_id where m.business_id=b and m.kind in ('collection','supplier_payment') and m.created_at>=start_at and m.created_at<end_at and (br is null or m.branch_id=br) and (u is null or m.user_id=u) group by a.id order by a.name) x),
 'purchases',(select coalesce(sum(d.total),0) from public.documents d where d.business_id=b and d.kind='purchase' and d.state='confirmed' and d.created_at>=start_at and d.created_at<end_at and (br is null or d.branch_id=br) and (u is null or d.created_by=u)),
 'returns_total',(select coalesce(sum(r.amount),0) from public.returns r join public.documents d on d.id=r.document_id where r.business_id=b and r.created_at>=start_at and r.created_at<end_at and (br is null or d.branch_id=br) and (u is null or r.user_id=u)),
 'cash_difference',(select coalesce(sum(s.counted-s.expected),0) from public.sessions s where s.business_id=b and s.closed_at>=start_at and s.closed_at<end_at and (br is null or s.branch_id=br) and (u is null or s.user_id=u)),
 'slow_products',(select coalesce(jsonb_agg(x),'[]') from (select p.id,p.name,p.code from public.products p where p.business_id=b and p.active and not exists(select 1 from public.inventory_moves m join public.warehouses w on w.id=m.warehouse_id where m.product_id=p.id and m.created_at>=start_at and m.created_at<end_at and (br is null or w.branch_id=br) and (u is null or m.user_id=u)) order by p.name limit 25) x),
 'aging',(select coalesce(jsonb_agg(x),'[]') from (select number,party_id,due_date,balance, greatest((now() at time zone tz)::date-due_date,0) days_overdue from public.document_balances where business_id=b and kind='sale' and state='confirmed' and balance>0 and (br is null or branch_id=br) and (u is null or created_by=u) order by due_date limit 100) x));
end $$;

create or replace function private.report(b uuid,f date,t date,br uuid default null) returns jsonb language sql stable security definer set search_path='' as $$ select private.report(b,f,t,br,null) $$;
drop function public.report(uuid,date,date,uuid);
create function public.report(p_business uuid,p_from date,p_to date,p_branch uuid default null,p_user uuid default null) returns jsonb language sql security invoker set search_path='' as $$ select private.report(p_business,p_from,p_to,p_branch,p_user) $$;
revoke all on function public.report(uuid,date,date,uuid,uuid),private.report(uuid,date,date,uuid,uuid) from public,anon;
grant execute on function public.report(uuid,date,date,uuid,uuid),private.report(uuid,date,date,uuid,uuid) to authenticated;

create table public.units(business_id uuid not null references public.businesses(id),name text not null check(length(name)<=80),primary key(business_id,name));
insert into public.units select distinct business_id,unit from public.products;
alter table public.units enable row level security;
create policy tenant_read on public.units for select to authenticated using(private.allowed(business_id,'products.read'));
grant select on public.units to authenticated;
revoke insert,update,delete on public.units from authenticated,anon;
alter table public.products add constraint products_unit_tenant foreign key(business_id,unit) references public.units(business_id,name);
create index products_unit_lookup on public.products(business_id,unit);

create table public.categories(business_id uuid not null references public.businesses(id),name text not null check(length(name)<=80),primary key(business_id,name));
insert into public.categories select distinct business_id,category from public.products;
alter table public.categories enable row level security;
create policy tenant_read on public.categories for select to authenticated using(private.allowed(business_id,'products.read'));
grant select on public.categories to authenticated;
revoke insert,update,delete on public.categories from authenticated,anon;
alter table public.products add constraint products_category_tenant foreign key(business_id,category) references public.categories(business_id,name);
create index products_category_lookup on public.products(business_id,category);

create table public.brands(business_id uuid not null references public.businesses(id),name text not null check(length(name)<=80),primary key(business_id,name));
insert into public.brands select distinct business_id,brand from public.products;
alter table public.brands enable row level security;
create policy tenant_read on public.brands for select to authenticated using(private.allowed(business_id,'products.read'));
grant select on public.brands to authenticated;
revoke insert,update,delete on public.brands from authenticated,anon;
alter table public.products add constraint products_brand_tenant foreign key(business_id,brand) references public.brands(business_id,name);
create index products_brand_lookup on public.products(business_id,brand);

alter table public.documents add column proof_path text;
alter table public.documents add column exchange_for uuid;
alter table public.documents add constraint document_exchange_tenant foreign key(business_id,exchange_for) references public.documents(business_id,id);
create index documents_exchange_lookup on public.documents(business_id,exchange_for);
alter table public.documents add column number_prefix text not null default '';
alter table public.documents alter column number set generated by default;
alter table public.businesses add column receipt_format text not null default 'a4' check(receipt_format in ('a4','80mm'));
create table public.document_series(business_id uuid not null references public.businesses(id),kind text not null check(kind in ('sale','purchase','quote')),prefix text not null default '' check(length(prefix)<=12),next_number bigint not null default 1 check(next_number between 1 and 1000000000000),primary key(business_id,kind));
insert into public.document_series(business_id,kind,next_number) select business_id,kind,max(number)+1 from public.documents group by business_id,kind;
alter table public.document_series enable row level security;
create policy tenant_read on public.document_series for select to authenticated using(private.allowed(business_id,'settings.write'));
grant select on public.document_series to authenticated;
revoke insert,update,delete on public.document_series from authenticated,anon;
create unique index documents_tenant_number on public.documents(business_id,kind,number);
drop policy tenant_read on public.returns;
create policy tenant_read on public.returns for select to authenticated using(private.allowed(business_id,'documents.read') and exists(select 1 from public.documents d where d.id=document_id));
alter table public.products add column parent_id uuid;
alter table public.products add constraint product_parent_tenant foreign key(business_id,parent_id) references public.products(business_id,id);
alter table public.products add constraint product_parent_not_self check(parent_id is distinct from id);
create index products_parent_lookup on public.products(business_id,parent_id);
create index products_code_prefix on public.products(business_id,lower(code) text_pattern_ops);
create or replace function private.read_data(b uuid,entity text,term text default '',page integer default 0,filters jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path='' as $$
#variable_conflict use_variable
declare perm text; table_name text; result jsonb; columns text='t.*'; clause text=''; count integer; query text; br uuid=(filters->>'branch_id')::uuid; id uuid=(filters->>'id')::uuid; w uuid=(filters->>'warehouse_id')::uuid;
begin
 perform private.require(b,'read');
 if page<0 or page>100000 or length(term)>200 then raise exception 'APP:Búsqueda no válida.'; end if;
 if entity='report_users' then perform private.require(b,'report.read'); return jsonb_build_object('rows',(select coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',m.role||' · '||left(m.user_id::text,8)) order by m.user_id),'[]') from public.memberships m where m.business_id=b and m.active),'count',(select count(*) from public.memberships where business_id=b and active),'page',0); end if;
 select t,p into table_name,perm from (values
 ('account_balances','accounts','money.read'),('units','units','products.read'),('categories','categories','products.read'),('brands','brands','products.read'),('products','products','products.read'),('presentations','presentations','products.read'),('stock','stock','products.read'),
 ('parties','parties','parties.read'),('documents','documents','documents.read'),('document_lines','document_lines','documents.read'),
 ('balances','document_balances','documents.read'),('sessions','sessions','money.read'),('money_moves','money_moves','money.read'),
 ('inventory_moves','inventory_moves','inventory.read'),('transfers','transfers','inventory.read'),('expenses','expenses','expense.write'),
 ('expense_rules','expense_rules','expense.write'),('employees','employees','users.write'),('warranties','warranties','documents.read'),
 ('memberships','memberships','users.write'),('audit','audit_log','users.write'),('returns','returns','documents.read'),('payments','payments','documents.read'),('deliveries','deliveries','documents.read')) a(e,t,p) where e=entity;
 if table_name is null then raise exception 'APP:Consulta no disponible.'; end if;
 perform private.require(b,perm);
 if entity in ('units','categories','brands') then columns='t.*,t.name as id';clause=' and t.name ilike ''%''||$2||''%''';
 elsif entity='memberships' then columns='t.*,(select u.email from auth.users u where u.id=t.user_id) as email';
 elsif entity='account_balances' then columns='t.*,(case when t.kind=''cash'' then coalesce((select s.opening+coalesce((select sum(m.amount) from public.money_moves m where m.session_id=s.id),0) from public.sessions s where s.account_id=t.id and s.closed_at is null),(select s.counted from public.sessions s where s.account_id=t.id and s.closed_at is not null order by s.closed_at desc limit 1),0) else coalesce((select sum(m.amount) from public.money_moves m where m.account_id=t.id),0) end) as balance';
 elsif entity='payments' then columns='t.*,(select p.name from public.parties p where p.id=t.party_id) as party_name,(select coalesce(jsonb_agg(jsonb_build_object(''document_id'',a.document_id,''number'',d.number,''number_prefix'',d.number_prefix,''amount'',a.amount)),''[]'') from public.payment_applications a join public.documents d on d.id=a.document_id where a.payment_id=t.id) as applications';
 elsif entity='stock' then columns='t.*,(select p.name from public.products p where p.id=t.product_id) as product_name'; if private.allowed(b,'cost.read') then columns=columns||', (select average from public.stock_costs c where c.business_id=t.business_id and c.warehouse_id=t.warehouse_id and c.product_id=t.product_id) as average'; end if;
 elsif entity in ('inventory_moves','transfers') then columns='t.*,(select p.name from public.products p where p.id=t.product_id) as product_name';
 elsif entity='products' then
 columns='t.*, (select coalesce(jsonb_agg(to_jsonb(pr)),''[]'') from public.presentations pr where pr.product_id=t.id and pr.active) as presentations, (select coalesce(sum(s.physical-s.reserved),0) from public.stock s where s.product_id=t.id and ($5 is null or s.warehouse_id=$5)) as available';
 clause=' and ($2='''' or to_tsvector(''simple'',t.name||'' ''||t.code||'' ''||t.brand) @@ to_tsquery(''simple'',array_to_string(array(select quote_literal(x)||'':*'' from regexp_split_to_table(regexp_replace($2,''[^[:alnum:] ]'','' '',''g''),'' + '') x where x<>''''),'' & '')) or lower(t.code) like lower($2)||''%'' or t.barcode=$2)';
 elsif entity='parties' then clause=' and t.name ilike ''%''||$2||''%''';
 elsif entity in ('expenses','expense_rules','employees','warranties') then clause=' and t.'||case entity when 'employees' then 'name' else 'description' end||' ilike ''%''||$2||''%''';
 end if;
 if entity in ('returns','deliveries','payments','warranties') and filters->>'document_id' is not null then clause=clause||case when entity='warranties' then format(' and t.line_id in(select id from public.document_lines where document_id=%L::uuid)',filters->>'document_id') when entity='payments' then format(' and exists(select 1 from public.payment_applications a where a.payment_id=t.id and a.document_id=%L::uuid)',filters->>'document_id') else format(' and t.document_id=%L::uuid',filters->>'document_id') end; end if;
 if entity in ('documents','balances','sessions','expenses','expense_rules','money_moves','account_balances') then clause=clause||' and ($3 is null or t.branch_id=$3)'; end if;
 if entity in ('documents','balances','parties') and filters->>'kind' is not null then clause=clause||format(' and t.kind=%L',filters->>'kind'); end if;
 if entity in ('documents','balances') and filters->>'party_id' is not null then clause=clause||format(' and t.party_id=%L::uuid',filters->>'party_id'); end if;
 if entity in ('documents','balances','inventory_moves','money_moves','returns','deliveries','payments') and filters->>'user_id' is not null then clause=clause||format(' and t.%I=%L::uuid',case when entity in ('documents','balances') then 'created_by' else 'user_id' end,filters->>'user_id');end if;
 if entity='documents' and filters->>'state' is not null then clause=clause||format(' and t.state=%L',filters->>'state'); end if;
 if entity='documents' and filters->>'pending'='true' then clause=clause||' and t.state=''confirmed'' and exists(select 1 from public.document_lines l where l.document_id=t.id and l.base_quantity>l.delivered+l.returned)'; end if;
 if entity='document_lines' then clause=clause||' and t.document_id=$4';
 elsif id is not null then clause=clause||' and t.id=$4'; end if;
 if entity in ('inventory_moves','stock') then clause=clause||' and ($5 is null or t.warehouse_id=$5)'; end if;
 if entity='payments' and not private.allowed(b,'cost.read') and not private.allowed(b,'purchase.write') then clause=clause||' and exists(select 1 from public.payment_applications a join public.documents d on d.id=a.document_id where a.payment_id=t.id and d.kind=''sale'')'; end if;
 if entity in ('documents','balances','inventory_moves','money_moves','returns','deliveries','payments') then
 if filters->>'from' is not null then clause=clause||format(' and t.created_at >= %L::date at time zone (select timezone from public.businesses where id=$1)',filters->>'from'); end if;
 if filters->>'to' is not null then clause=clause||format(' and t.created_at < (%L::date+1) at time zone (select timezone from public.businesses where id=$1)',filters->>'to'); end if;
 end if;
 query=format(' from public.%I t where t.business_id=$1%s',table_name,clause);
 execute 'select count(*)'||query into count using b,term,br,id,w;
 execute 'select coalesce(jsonb_agg(to_jsonb(x)),''[]'') from (select '||columns||query||' order by '||case when entity='memberships' then 't.user_id' when entity='stock' then 't.product_id' when entity in ('units','categories','brands') then 't.name' when entity in ('products','parties') then case when filters->>'sort'='name_desc' then 't.name desc,t.id' when filters->>'sort'='newest' then 't.created_at desc,t.id' else 't.name,t.id' end when entity in ('documents','balances','money_moves','inventory_moves','payments','audit','returns','deliveries') then 't.created_at desc,t.id' else 't.id' end||' limit 25 offset '||(page*25)||') x' into result using b,term,br,id,w;
 -- Mask procurement values even in direct RPC calls.
 if not private.allowed(b,'cost.read') and not private.allowed(b,'purchase.write') then
 if entity='documents' then select coalesce(jsonb_agg(case when x->>'kind'='purchase' then x-'subtotal'-'tax'-'total'-'extra_cost' else x end),'[]') into result from jsonb_array_elements(result) x;
 elsif entity='document_lines' and exists(select 1 from public.documents where documents.id=id and kind='purchase') then select coalesce(jsonb_agg(x-'price'-'discount'-'subtotal'-'tax'-'total'),'[]') into result from jsonb_array_elements(result) x;
 elsif entity='returns' then select coalesce(jsonb_agg(case when exists(select 1 from public.documents d where d.id=(x->>'document_id')::uuid and d.kind='purchase') then x-'amount' else x end),'[]') into result from jsonb_array_elements(result) x;
 elsif entity='transfers' then select coalesce(jsonb_agg(x-'unit_cost'),'[]') into result from jsonb_array_elements(result) x;
 elsif entity='balances' then select coalesce(jsonb_agg(x),'[]') into result from jsonb_array_elements(result) x where x->>'kind'<>'purchase'; end if;
 end if;
 return jsonb_build_object('rows',result,'count',count,'page',page);
end $$;

alter function private.run_command(uuid,text,jsonb) rename to managed_command;
create function private.run_command(b uuid,action text,d jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; v_kind text; label text; q numeric; product uuid; v_series public.document_series; v_product public.products; v_id uuid;
begin
 perform private.require(b,'read');
 if action='document.create' and d->>'exchange_for' is not null and not exists(select 1 from public.documents doc where doc.business_id=b and doc.id=(d->>'exchange_for')::uuid and doc.kind='sale' and doc.state='confirmed' and exists(select 1 from public.returns r where r.document_id=doc.id)) then raise exception 'APP:Registra primero la devolución de la venta original.';end if;
 if action='catalog.save' then
 perform private.require(b,'settings.write');v_kind=d->>'kind';label=trim(d->>'name');
 if v_kind not in ('units','categories','brands') or length(label) not between 1 and 80 then raise exception 'APP:Indica un nombre de catálogo válido.';end if;
 execute format('insert into public.%I(business_id,name) values($1,$2) on conflict do nothing',v_kind) using b,label;
 return jsonb_build_object('id',label);
 elsif action='numbering.save' then
 perform private.require(b,'settings.write');
 if coalesce((d->>'next_number')::bigint,0)<=(select coalesce(max(number),0) from public.documents where business_id=b and kind=d->>'kind') then raise exception 'APP:El siguiente número debe ser mayor a los documentos existentes.';end if;
 insert into public.document_series(business_id,kind,prefix,next_number) values(b,d->>'kind',coalesce(d->>'prefix',''),(d->>'next_number')::bigint) on conflict(business_id,kind) do update set prefix=excluded.prefix,next_number=excluded.next_number;
 return jsonb_build_object('ok',true);
 elsif action='expense_rule.toggle' then
 perform private.require(b,'expense.write');update public.expense_rules set active=(d->>'active')::boolean where business_id=b and id=(d->>'id')::uuid;return jsonb_build_object('id',d->>'id');
 elsif action='money.adjust' then
 perform private.require(b,'cash.write');q=(d->>'amount')::numeric;
 if q<=0 or d->>'direction' not in ('deposit','withdrawal') or length(trim(coalesce(d->>'reference','')))<3 then raise exception 'APP:Revisa el importe y el motivo del depósito o retiro.';end if;
 v_id=gen_random_uuid();perform private.money_move(b,(d->>'account_id')::uuid,q*case when d->>'direction'='deposit' then 1 else -1 end,d->>'direction',v_id,d->>'reference');
 return jsonb_build_object('id',v_id);
 elsif action='product.save' then
 perform private.require(b,'products.write');
 select * into v_product from public.products where business_id=b and id=(d->>'id')::uuid;
 if v_product.id is not null and not private.allowed(b,'price.write') and ((d->>'price')::numeric is distinct from v_product.price or (d->>'wholesale_price')::numeric is distinct from v_product.wholesale_price) then raise exception 'APP:No tienes permiso para cambiar precios.';end if;
 insert into public.units values(b,coalesce(d->>'unit','unidad')) on conflict do nothing;
 insert into public.categories values(b,coalesce(d->>'category','')) on conflict do nothing;
 insert into public.brands values(b,coalesce(d->>'brand','')) on conflict do nothing;
 if d->>'supplier_id' is not null and not exists(select 1 from public.parties where business_id=b and id=(d->>'supplier_id')::uuid and kind='supplier') then raise exception 'APP:Selecciona un proveedor de este negocio.'; end if;
 if jsonb_typeof(coalesce(d->'attributes','{}'))<>'object' then raise exception 'APP:Los atributos deben tener nombre y valor.'; end if;
 elsif action='payment.create' then
 if exists(select 1 from jsonb_array_elements(d->'applications') x join public.documents doc on doc.id=(x->>'document_id')::uuid where doc.business_id=b and ((doc.kind='sale' and d->>'direction'<>'in') or (doc.kind='purchase' and d->>'direction'<>'out'))) then raise exception 'APP:Los reembolsos requieren registrar una devolución o anulación.';end if;
 elsif action='membership.save' and coalesce(d->>'email','')<>'' then
 perform private.require(b,'users.write');select id into v_id from auth.users where lower(email)=lower(trim(d->>'email'));if v_id is null then raise exception 'APP:La persona debe crear y confirmar su cuenta primero.';end if;d=d||jsonb_build_object('user_id',v_id);
 elsif action='presentation.save' then perform private.require(b,'price.write');if d->>'name'='Unidad base' and (d->>'factor')::numeric<>1 then raise exception 'APP:La unidad base siempre tiene factor 1. Crea otra presentación para cajas o rollos.';end if;
 elsif action='document.create' and d->>'party_id' is not null then perform pg_advisory_xact_lock(hashtextextended(b::text||'party'||(d->>'party_id'),0));
 elsif action in ('inventory.transfer','delivery.create','quote.reserve') then
 q=(d->>'quantity')::numeric;
 if action='inventory.transfer' then product=(d->>'product_id')::uuid;if d->>'from_warehouse'=d->>'to_warehouse' then raise exception 'APP:Selecciona una bodega de destino diferente.'; end if;perform pg_advisory_xact_lock(hashtextextended(b::text||(d->>'from_warehouse')||product::text,0));
 else select product_id into product from public.document_lines where business_id=b and id=(d->>'line_id')::uuid; end if;
 if exists(select 1 from public.products where business_id=b and id=product and not fractional) and trunc(q)<>q then raise exception 'APP:Este producto requiere unidades enteras.';end if;
 elsif action='delivery.attach' then
 perform private.require(b,'delivery.write');
 if split_part(d->>'path','/',1)<>b::text or split_part(d->>'path','/',2)<>'deliveries' then raise exception 'APP:Archivo no autorizado.';end if;
 update public.deliveries set proof_path=d->>'path' where business_id=b and id=(d->>'id')::uuid;
 return jsonb_build_object('id',d->>'id');
 elsif action='document.attach' then
 perform private.require(b,'purchase.write');
 if split_part(d->>'path','/',1)<>b::text or split_part(d->>'path','/',2)<>'documents' then raise exception 'APP:Archivo no autorizado.';end if;
 update public.documents set proof_path=d->>'path' where business_id=b and id=(d->>'id')::uuid and kind='purchase';
 return jsonb_build_object('id',d->>'id');
 elsif action='business.attach' then
 perform private.require(b,'settings.write');
 if split_part(d->>'path','/',1)<>b::text or split_part(d->>'path','/',2)<>'photos' then raise exception 'APP:Archivo no autorizado.';end if;
 update public.businesses set logo_path=d->>'path' where id=b;return jsonb_build_object('id',b);
 end if;
 result=private.managed_command(b,action,d);
 if action='product.save' then update public.products set parent_id=(d->>'parent_id')::uuid where business_id=b and id=(result->>'id')::uuid;
 elsif action='document.void' then update public.documents set voided_at=now(),void_reason=d->>'reason' where business_id=b and id=(d->>'id')::uuid;
 elsif action='settings.save' then update public.businesses set receipt_format=coalesce(d->>'receipt_format','a4') where id=b;
 elsif action='document.create' then
 insert into public.document_series(business_id,kind) values(b,d->>'kind') on conflict do nothing;
 select * into v_series from public.document_series where business_id=b and kind=d->>'kind' for update;
 update public.documents set number=v_series.next_number,number_prefix=v_series.prefix,exchange_for=(d->>'exchange_for')::uuid where id=(result->>'id')::uuid and business_id=b;
 update public.document_series set next_number=next_number+1 where business_id=b and kind=d->>'kind';
 result=result||jsonb_build_object('number',v_series.next_number,'number_prefix',v_series.prefix);
 elsif action='quote.state' and d->>'state' in ('rejected','expired') then perform private.release_reservations(b,(d->>'id')::uuid);
 end if;
 return result;
end $$;
revoke all on function private.managed_command(uuid,text,jsonb),private.run_command(uuid,text,jsonb) from public,anon,authenticated;
create or replace function private.release_reservations(b uuid,origin uuid default null) returns integer language plpgsql security definer set search_path='' as $$
declare r public.reservations; count integer=0;
begin
 update public.documents d set state='expired' where d.business_id=b and d.kind='quote' and d.state in ('draft','sent','accepted') and d.valid_until < (now() at time zone (select timezone from public.businesses where id=b))::date;
 for r in select * from public.reservations where business_id=b and released_at is null and (document_id=origin or (origin is null and (expires_at<=now() or document_id in(select id from public.documents where business_id=b and kind='quote' and state in ('expired','rejected'))))) order by warehouse_id,product_id,id for update loop
 perform pg_advisory_xact_lock(hashtextextended(b::text||r.warehouse_id::text||r.product_id::text,0));
 update public.stock set reserved=reserved-r.quantity where business_id=b and warehouse_id=r.warehouse_id and product_id=r.product_id;
 update public.reservations set released_at=now() where id=r.id; count=count+1;
 end loop;
 return count;
end $$;
drop policy files_insert on storage.objects;
create policy files_insert on storage.objects for insert to authenticated with check(bucket_id='business-files' and
 ((split_part(name,'/',2)='photos' and (private.allowed((storage.foldername(name))[1]::uuid,'products.write') or private.allowed((storage.foldername(name))[1]::uuid,'settings.write'))) or
 (split_part(name,'/',2)='documents' and (private.allowed((storage.foldername(name))[1]::uuid,'expense.write') or private.allowed((storage.foldername(name))[1]::uuid,'purchase.write'))) or
 (split_part(name,'/',2)='deliveries' and private.allowed((storage.foldername(name))[1]::uuid,'delivery.write'))));create or replace view public.document_balances with (security_invoker=true) as
 select d.id,d.business_id,d.branch_id,d.number,d.kind,d.state,d.party_id,d.total,d.due_date,d.created_at,
 coalesce((select sum(a.amount*case when (d.kind='sale' and p.direction='in') or (d.kind='purchase' and p.direction='out') then 1 else -1 end) from public.payment_applications a join public.payments p on p.id=a.payment_id where a.document_id=d.id),0) paid,
 coalesce((select sum(r.amount) from public.returns r where r.document_id=d.id),0) refunded,
 case when d.state='void' then 0 else d.total-coalesce((select sum(a.amount*case when (d.kind='sale' and p.direction='in') or (d.kind='purchase' and p.direction='out') then 1 else -1 end) from public.payment_applications a join public.payments p on p.id=a.payment_id where a.document_id=d.id),0)-coalesce((select sum(r.amount) from public.returns r where r.document_id=d.id),0) end balance,d.created_by,d.number_prefix
 from public.documents d;