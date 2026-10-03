-- Supabase/PostgreSQL: pg_cron corre sin navegador ni petición web.
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
select cron.schedule('ferro-recurring-expenses','5 6 * * *','select private.generate_expenses()');
select cron.schedule('ferro-release-reservations','*/5 * * * *',$job$
 do $body$ declare b uuid; begin
 for b in select id from public.businesses loop perform private.release_reservations(b); end loop;
 end $body$;
$job$);
