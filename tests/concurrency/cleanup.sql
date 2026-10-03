begin;
do $$ declare b uuid='90000000-0000-4000-8000-000000000001'; t text; begin
if not exists(select 1 from public.businesses where id=b and name='__QA_TEMPORAL_SIMULTANEIDAD__') then raise exception 'Fixture de prueba no encontrado; no se elimina nada.'; end if;
delete from private.requests where business_id=b;
foreach t in array array['audit_log','money_moves','payment_applications','payments','reservations','deliveries','returns','warranties','inventory_moves','line_costs','document_lines','documents','document_series','sessions','stock_costs','stock','transfers','price_rules','presentations','products','units','categories','brands','expenses','expense_rules','employees','parties','accounts','warehouses','branches','memberships','service_payments','subscriptions'] loop
execute format('delete from public.%I where business_id=$1',t) using b;
end loop;
delete from public.businesses where id=b;
delete from auth.users where id in ('90000000-0000-4000-8000-000000000101','90000000-0000-4000-8000-000000000102');
end $$;
commit;
