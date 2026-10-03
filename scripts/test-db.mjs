import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid,name text,bucket_id text); alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
grant usage on schema auth,storage to authenticated; grant execute on function auth.uid() to authenticated;`);
  await db.exec('grant select,insert on storage.objects to authenticated');
  for (const file of (await readdir('supabase/migrations'))
    .filter((f) => f.endsWith('.sql') && !f.endsWith('_scheduler.sql'))
    .sort()) {
    console.log('Migration:', file);
    await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
  }
  await db.exec(await readFile('tests/database.sql', 'utf8'));
  console.log('Todas las comprobaciones de PostgreSQL pasaron.');
  await db.close();
} catch (error) {
  console.error(error.message, '\n', error.detail || '', '\n', error.where || '');
  await db.close();
  process.exitCode = 1;
}
