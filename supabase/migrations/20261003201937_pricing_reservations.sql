create function private.price_line(b uuid,product uuid,presentation uuid,q numeric,party uuid,override_price numeric,discount numeric,k text)
returns table(price numeric,subtotal numeric,tax numeric,total numeric,factor numeric) language plpgsql stable security definer set search_path='' as $$
declare v_product public.products; v_pr public.presentations; v_party public.parties; v_policy numeric; v_rule numeric; v_discount_limit numeric;
begin
 select * into v_product from public.products where business_id=b and id=product and active;
 select * into v_pr from public.presentations where business_id=b and id=presentation and product_id=product and active;
 if v_product.id is null or v_pr.id is null then raise exception 'APP:Selecciona un producto y una presentación activos.'; end if;
 if q<=0 or round(q,6)<>q or (not v_product.fractional and trunc(q*v_pr.factor)<>q*v_pr.factor) then raise exception 'APP:Revisa la cantidad; este producto no permite fracciones.'; end if;
 select * into v_party from public.parties where business_id=b and id=party and active;
 v_policy=case when v_party.price_level='wholesale' and v_product.wholesale_price is not null then round(v_product.wholesale_price*v_pr.factor,2) else v_pr.price end;
 select r.price*v_pr.factor into v_rule from public.price_rules r where r.business_id=b and r.product_id=product and (r.party_id is null or r.party_id=party) and q*v_pr.factor>=r.min_quantity order by (r.party_id is not null) desc,r.min_quantity desc,r.id limit 1;
 v_policy=coalesce(v_rule,v_policy); price=coalesce(override_price,v_policy);
 if k<>'purchase' and price<>v_policy and not private.allowed(b,'price.write') then raise exception 'APP:No tienes permiso para cambiar este precio.'; end if;
 if price<0 or discount<0 or discount>round(q*price,2) or round(price,2)<>price or round(discount,2)<>discount then raise exception 'APP:Revisa precio y descuento.'; end if;
 select max_discount into v_discount_limit from public.businesses where id=b;
 if discount>q*price*v_discount_limit/100 and not private.allowed(b,'discount.authorize') then raise exception 'APP:El descuento supera el límite autorizado.'; end if;
 factor=v_pr.factor; subtotal=round(q*price-discount,2); tax=round(subtotal*v_product.tax_rate/100,2); total=subtotal+tax;
 return next;
end $$;
create function private.preview(b uuid,d jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare x jsonb; r record; lines jsonb='[]'; subtotal numeric=0; tax numeric=0; total numeric=0; kind text=d->>'kind';
begin
 perform private.require(b,case kind when 'sale' then 'sale.create' when 'purchase' then 'purchase.write' when 'quote' then 'quote.write' else 'invalid' end);
 for x in select v from jsonb_array_elements(d->'lines') v loop
 select * into r from private.price_line(b,(x->>'product_id')::uuid,(x->>'presentation_id')::uuid,(x->>'quantity')::numeric,(d->>'party_id')::uuid,(x->>'price')::numeric,coalesce((x->>'discount')::numeric,0),kind);
 subtotal=subtotal+r.subtotal;tax=tax+r.tax;total=total+r.total;
 lines=lines||jsonb_build_array(jsonb_build_object('product_id',x->>'product_id','presentation_id',x->>'presentation_id','price',r.price,'total',r.total));
 end loop;
 return jsonb_build_object('lines',lines,'subtotal',subtotal,'tax',tax,'total',total+coalesce((d->>'transport')::numeric,0)+coalesce((d->>'extra_cost')::numeric,0));
end $$;
create function public.preview(p_business uuid,p_data jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.preview(p_business,p_data) $$;
revoke all on function private.price_line(uuid,uuid,uuid,numeric,uuid,numeric,numeric,text),private.preview(uuid,jsonb),public.preview(uuid,jsonb) from public,anon,authenticated;
grant execute on function private.preview(uuid,jsonb),public.preview(uuid,jsonb) to authenticated;

create table public.reservations (
 id uuid primary key default gen_random_uuid(),business_id uuid not null,document_id uuid not null,line_id uuid not null,
 warehouse_id uuid not null,product_id uuid not null,quantity numeric(18,6) not null check(quantity>0),expires_at timestamptz not null,released_at timestamptz,
 foreign key(business_id,document_id) references public.documents(business_id,id),foreign key(business_id,line_id) references public.document_lines(business_id,id),
 foreign key(business_id,warehouse_id,product_id) references public.stock(business_id,warehouse_id,product_id)
);
create index reservations_tenant on public.reservations(business_id);
create index reservations_expiry on public.reservations(expires_at) where released_at is null;
alter table public.reservations enable row level security;
create policy tenant_read on public.reservations for select to authenticated using(private.allowed(business_id,'inventory.read'));
grant select on public.reservations to authenticated;
revoke insert,update,delete on public.reservations from authenticated,anon;
create unique index quote_one_sale on public.documents(business_id,origin_id) where kind='sale' and origin_id is not null and state<>'void';

create function private.release_reservations(b uuid,origin uuid default null) returns integer language plpgsql security definer set search_path='' as $$
declare r public.reservations; count integer=0;
begin
 for r in select * from public.reservations where business_id=b and released_at is null and (document_id=origin or (origin is null and expires_at<=now())) order by warehouse_id,product_id,id for update loop
 perform pg_advisory_xact_lock(hashtextextended(b::text||r.warehouse_id::text||r.product_id::text,0));
 update public.stock set reserved=reserved-r.quantity where business_id=b and warehouse_id=r.warehouse_id and product_id=r.product_id;
 update public.reservations set released_at=now() where id=r.id; count=count+1;
 end loop;
 return count;
end $$;
alter function private.run_command(uuid,text,jsonb) rename to core_run_command;
create function private.run_command(b uuid,action text,d jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_doc public.documents; v_line public.document_lines; v_qty numeric; v_id uuid=gen_random_uuid(); v_date timestamptz; v_reserved numeric; v_result jsonb;
begin
 perform private.release_reservations(b);
 if action='quote.reserve' then
 perform private.require(b,'inventory.write');
 select * into v_doc from public.documents where business_id=b and id=(d->>'document_id')::uuid and kind='quote' and state in ('draft','sent','accepted') for update;
 select * into v_line from public.document_lines where business_id=b and document_id=v_doc.id and id=(d->>'line_id')::uuid for update;
 v_qty=(d->>'quantity')::numeric;
 select ((d->>'expires_at')::date+1)::timestamp at time zone timezone into v_date from public.businesses where id=b;
 select coalesce(sum(quantity),0) into v_reserved from public.reservations where line_id=v_line.id and released_at is null;
 if v_line.id is null or v_qty<=0 or v_qty+v_reserved>v_line.base_quantity or v_date<=now() then raise exception 'APP:Revisa la cantidad y el vencimiento de la reserva.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(b::text||v_doc.warehouse_id::text||v_line.product_id::text,0));
 update public.stock set reserved=reserved+v_qty where business_id=b and warehouse_id=v_doc.warehouse_id and product_id=v_line.product_id and physical-reserved>=v_qty;
 if not found then raise exception 'APP:No hay existencias suficientes para reservar.'; end if;
 insert into public.reservations(id,business_id,document_id,line_id,warehouse_id,product_id,quantity,expires_at) values(v_id,b,v_doc.id,v_line.id,v_doc.warehouse_id,v_line.product_id,v_qty,v_date);
 return jsonb_build_object('id',v_id);
 elsif action='document.create' and d->>'kind'='sale' and d->>'origin_id' is not null then
 select * into v_doc from public.documents where business_id=b and id=(d->>'origin_id')::uuid and kind='quote' and state in ('draft','sent','accepted') for update;
 if not found then raise exception 'APP:La cotización no se puede convertir.'; end if;
 perform private.release_reservations(b,v_doc.id);
 v_result=private.core_run_command(b,action,d);
 update public.documents set state='accepted' where id=v_doc.id;
 return v_result;
 elsif action='product.attach' then
 perform private.require(b,'products.write');
 if split_part(d->>'path','/',1)<>b::text or split_part(d->>'path','/',2)<>'photos' then raise exception 'APP:Archivo no autorizado.'; end if;
 update public.products set photo_path=d->>'path' where business_id=b and id=(d->>'id')::uuid;
 return jsonb_build_object('id',d->>'id');
 end if;
 return private.core_run_command(b,action,d);
end $$;
revoke all on function private.core_run_command(uuid,text,jsonb),private.run_command(uuid,text,jsonb),private.release_reservations(uuid,uuid) from public,anon,authenticated;

-- Archivos privados: fotografías visibles en catálogo; documentos solo a quienes manejan dinero.
drop policy files_read on storage.objects;
drop policy files_insert on storage.objects;
create policy files_read on storage.objects for select to authenticated using(bucket_id='business-files' and
 ((split_part(name,'/',2)='photos' and private.allowed((storage.foldername(name))[1]::uuid,'products.read')) or
 (split_part(name,'/',2)='documents' and private.allowed((storage.foldername(name))[1]::uuid,'money.read')) or
 (split_part(name,'/',2)='deliveries' and private.allowed((storage.foldername(name))[1]::uuid,'delivery.write'))));
create policy files_insert on storage.objects for insert to authenticated with check(bucket_id='business-files' and
 ((split_part(name,'/',2)='photos' and private.allowed((storage.foldername(name))[1]::uuid,'products.write')) or
 (split_part(name,'/',2)='documents' and private.allowed((storage.foldername(name))[1]::uuid,'expense.write')) or
 (split_part(name,'/',2)='deliveries' and private.allowed((storage.foldername(name))[1]::uuid,'delivery.write'))));

drop policy tenant_read on public.payment_applications;
create policy tenant_read on public.payment_applications for select to authenticated using(private.allowed(business_id,'documents.read') and exists(select 1 from public.documents d where d.id=document_id));
drop policy tenant_read on public.payments;
create policy tenant_read on public.payments for select to authenticated using(private.allowed(business_id,'documents.read') and exists(select 1 from public.payment_applications a where a.payment_id=id));
