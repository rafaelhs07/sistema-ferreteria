// Adaptador de protocolo EXCLUSIVO de pruebas. Los RPC ejecutan las migraciones reales en PostgreSQL/PGlite.
// No importa .env.local, no accede al proyecto remoto y solo escucha en loopback.
import http from 'node:http';
import { createHmac, randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
const db = new PGlite();
const uid = '00000000-0000-4000-8000-000000000001';
await db.exec(`create role anon; create role authenticated; create schema auth; create schema storage;
create table auth.users(id uuid primary key,email text);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid,name text,bucket_id text); alter table storage.objects enable row level security;
create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
grant usage on schema auth,storage to authenticated; grant execute on function auth.uid() to authenticated;
grant select,insert on storage.objects to authenticated;
insert into auth.users(id,email) values('${uid}','admin@pruebas.local');`);
for (const f of (await readdir('supabase/migrations'))
  .filter((f) => f.endsWith('.sql') && !f.endsWith('_scheduler.sql'))
  .sort())
  await db.exec(await readFile('supabase/migrations/' + f, 'utf8'));
const user = {
  id: uid,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'admin@pruebas.local',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  created_at: new Date().toISOString(),
};
function token() {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: uid,
      aud: 'authenticated',
      role: 'authenticated',
      email: user.email,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 86400,
    }),
  ).toString('base64url');
  return `${header}.${payload}.${createHmac('sha256', 'test-only-loopback-key')
    .update(header + '.' + payload)
    .digest('base64url')}`;
}
const methods = {
  context: [],
  bootstrap: ['p_name', 'p_key'],
  workspace: ['p_business'],
  read_data: ['p_business', 'p_entity', 'p_term', 'p_page', 'p_filters'],
  command: ['p_business', 'p_key', 'p_action', 'p_data'],
  report: ['p_business', 'p_from', 'p_to', 'p_branch', 'p_user'],
  preview: ['p_business', 'p_data'],
  platform: ['p_action', 'p_data'],
};
let queue = Promise.resolve();
const files = new Map();
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  const url = new URL(req.url, 'http://127.0.0.1:54329');
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks);
  const body =
    raw.length && req.headers['content-type']?.includes('json') ? JSON.parse(raw.toString()) : {};
  const send = (code, data) => {
    res.statusCode = code;
    res.end(JSON.stringify(data));
  };
  if (url.pathname === '/auth/v1/token') {
    if (body.email !== user.email || body.password !== 'Pruebas-locales-2026')
      return send(400, { message: 'Credenciales incorrectas' });
    return send(200, {
      access_token: token(),
      token_type: 'bearer',
      expires_in: 86400,
      refresh_token: 'local-tests-only',
      user,
    });
  }
  if (url.pathname === '/auth/v1/user') {
    return req.headers.authorization?.startsWith('Bearer ')
      ? send(200, user)
      : send(401, { message: 'Inicia sesión' });
  }
  if (url.pathname === '/auth/v1/logout') return send(200, {});
  if (url.pathname === '/health') return send(200, { ok: true });
  if (url.pathname.startsWith('/storage/v1/object/')) {
    const signing = url.pathname.startsWith('/storage/v1/object/sign/');
    const path = decodeURIComponent(
      url.pathname.slice(
        (signing ? '/storage/v1/object/sign/business-files/' : '/storage/v1/object/business-files/')
          .length,
      ),
    );
    if (req.method === 'GET' && signing && url.searchParams.get('token') === 'ephemeral-only') {
      const file = files.get(path);
      if (!file) return send(404, { message: 'No disponible' });
      res.setHeader('Content-Type', file.type);
      res.end(file.bytes);
      return;
    }
    if (!req.headers.authorization?.startsWith('Bearer '))
      return send(401, { message: 'Inicia sesión' });
    const task = async () => {
      try {
        await db.exec('begin');
        await db.query("select set_config('request.jwt.claim.sub',$1,true)", [uid]);
        await db.exec('set local role authenticated');
        if (signing) {
          const selected = await db.query(
            'select name from storage.objects where bucket_id=$1 and name=$2',
            ['business-files', path],
          );
          if (!selected.rows.length) throw new Error('Archivo no disponible');
          await db.exec('commit');
          send(200, { signedURL: `/object/sign/business-files/${path}?token=ephemeral-only` });
        } else {
          await db.query('insert into storage.objects(id,bucket_id,name) values($1,$2,$3)', [
            randomUUID(),
            'business-files',
            path,
          ]);
          await db.exec('commit');
          files.set(path, { bytes: raw, type: req.headers['content-type'] });
          send(200, { Key: 'business-files/' + path, Id: randomUUID() });
        }
      } catch (e) {
        await db.exec('rollback');
        send(403, { message: e.message });
      }
    };
    queue = queue.then(task, task);
    return;
  }
  if (url.pathname.startsWith('/rest/v1/rpc/')) {
    const name = url.pathname.split('/').pop();
    if (!Object.hasOwn(methods, name)) return send(404, { message: 'RPC no disponible' });
    if (!req.headers.authorization?.startsWith('Bearer '))
      return send(401, { message: 'Inicia sesión' });
    const task = async () => {
      try {
        const args = methods[name].filter((a) => Object.hasOwn(body, a));
        const values = args.map((a) =>
          typeof body[a] === 'object' && body[a] !== null ? JSON.stringify(body[a]) : body[a],
        );
        await db.exec('begin');
        await db.query("select set_config('request.jwt.claim.sub',$1,true)", [uid]);
        await db.exec('set local role authenticated');
        const result = await db.query(
          `select public.${name}(${args.map((a, i) => `${a} => $${i + 1}`).join(',')}) as data`,
          values,
        );
        await db.exec('commit');
        send(200, result.rows[0].data);
      } catch (e) {
        await db.exec('rollback');
        send(400, { message: e.message, code: e.code || 'P0001', details: e.detail });
      }
    };
    queue = queue.then(task, task);
    return;
  }
  send(404, { message: 'No disponible en el adaptador de pruebas' });
});
server.listen(54329, '127.0.0.1', () =>
  console.log('PostgreSQL efímero de pruebas listo en 54329'),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    server.closeAllConnections();
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 1500).unref();
  });
