begin;
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000102',true);
select public.command('90000000-0000-4000-8000-000000000001',gen_random_uuid(),'document.create',jsonb_build_object(
'kind','sale','branch_id',(select id from public.branches where business_id='90000000-0000-4000-8000-000000000001'),
'warehouse_id',(select id from public.warehouses where business_id='90000000-0000-4000-8000-000000000001'),
'lines',jsonb_build_array(jsonb_build_object('product_id',(select id from public.products where business_id='90000000-0000-4000-8000-000000000001'),'presentation_id',(select id from public.presentations where business_id='90000000-0000-4000-8000-000000000001'),'quantity',1)),
'payments',jsonb_build_array(jsonb_build_object('account_id',(select id from public.accounts where business_id='90000000-0000-4000-8000-000000000001' and kind='bank'),'amount',10)))) as sale;
select pg_sleep(2);
commit;
