begin;
insert into auth.users(id) values('90000000-0000-4000-8000-000000000101'),('90000000-0000-4000-8000-000000000102');
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000101',true);
select public.bootstrap('__QA_TEMPORAL_SIMULTANEIDAD__','90000000-0000-4000-8000-000000000001');
select public.command('90000000-0000-4000-8000-000000000001',gen_random_uuid(),'product.save','{"code":"QA-LAST","name":"Última existencia QA temporal","price":10,"fractional":false}');
select public.command('90000000-0000-4000-8000-000000000001',gen_random_uuid(),'inventory.adjust',jsonb_build_object('warehouse_id',(select id from public.warehouses where business_id='90000000-0000-4000-8000-000000000001'),'product_id',(select id from public.products where business_id='90000000-0000-4000-8000-000000000001'),'quantity',1,'cost',2,'reason','Fixture temporal de prueba'));
insert into public.memberships(business_id,user_id,role) values('90000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000102','VENDEDOR');
update public.memberships set role='VENDEDOR' where business_id='90000000-0000-4000-8000-000000000001' and user_id='90000000-0000-4000-8000-000000000101';
commit;
