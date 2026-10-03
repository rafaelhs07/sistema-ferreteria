-- Conserva el índice de negocio ya existente; retira únicamente su duplicado exacto.
do $$ declare t text; begin
foreach t in array array['accounts','audit_log','branches','documents','employees','memberships','parties','presentations','price_rules','products','sessions','stock','warehouses'] loop
execute format('drop index if exists public.%I',t||'_business_id_fkey_lookup');
end loop;
end $$;
create index requests_user_lookup on private.requests(user_id);
