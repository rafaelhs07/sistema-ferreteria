// Herramienta de operador. Nunca se importa en Next.js ni imprime credenciales.
import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, sep, dirname } from 'node:path';
import { createHash } from 'node:crypto';
const [mode, directory, flag] = process.argv.slice(2);
if (!['backup', 'restore'].includes(mode) || !directory)
  throw new Error('Uso: node scripts/storage-backup.mjs backup|restore DIRECTORIO [--overwrite]');
const url = process.env.SUPABASE_URL,
  key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key)
  throw new Error(
    'Configura SUPABASE_URL y SUPABASE_SECRET_KEY exclusivamente en el entorno del operador.',
  );
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const root = resolve(directory),
  filesRoot = resolve(root, 'files');
function localPath(name) {
  const path = resolve(filesRoot, name);
  if (!path.toLowerCase().startsWith((filesRoot + sep).toLowerCase()))
    throw new Error('Ruta de archivo fuera del respaldo.');
  return path;
}
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const bucket = db.storage.from('business-files');
if (mode === 'backup') {
  await mkdir(root, { recursive: true });
  // Reserva el destino: no pisa un respaldo anterior.
  await writeFile(resolve(root, 'manifest.json'), JSON.stringify({ incomplete: true }), {
    flag: 'wx',
  });
  const objects = [];
  async function walk(prefix = '') {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await bucket.list(prefix, {
        limit: 1000,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) throw new Error('No se pudo listar Storage. Comprueba permisos del operador.');
      for (const entry of data) {
        const name = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (!entry.id) {
          await walk(name);
          continue;
        }
        const { data: file, error: download } = await bucket.download(name);
        if (download) throw new Error(`No se pudo respaldar ${name}`);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const target = localPath(name);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, bytes, { flag: 'wx' });
        objects.push({
          path: name,
          size: bytes.byteLength,
          sha256: hash(bytes),
          contentType: file.type || entry.metadata?.mimetype || 'application/octet-stream',
        });
      }
      if (data.length < 1000) break;
    }
  }
  await walk();
  await writeFile(
    resolve(root, 'manifest.json'),
    JSON.stringify(
      {
        bucket: 'business-files',
        createdAt: new Date().toISOString(),
        sourceHost: new URL(url).hostname,
        objects,
      },
      null,
      2,
    ),
  );
  console.log(`Respaldo completo: ${objects.length} archivos, con SHA-256. ${root}`);
} else {
  const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
  if (
    manifest.incomplete ||
    manifest.bucket !== 'business-files' ||
    !Array.isArray(manifest.objects)
  )
    throw new Error('Respaldo incompleto o no compatible.');
  const seen = new Set();
  // Valida todos los archivos antes de escribir al proyecto destino.
  for (const file of manifest.objects) {
    if (seen.has(file.path)) throw new Error('Rutas duplicadas en el respaldo.');
    seen.add(file.path);
    const bytes = await readFile(localPath(file.path));
    if (bytes.byteLength !== file.size || hash(bytes) !== file.sha256)
      throw new Error(`Integridad incorrecta: ${file.path}`);
  }
  for (const file of manifest.objects) {
    const bytes = await readFile(localPath(file.path));
    const { error } = await bucket.upload(file.path, bytes, {
      contentType: file.contentType,
      upsert: flag === '--overwrite',
    });
    if (error)
      throw new Error(
        `No se pudo restaurar ${file.path}. El modo normal no sobrescribe objetos existentes.`,
      );
  }
  console.log(
    `Restauración completa: ${manifest.objects.length} archivos en ${new URL(url).hostname}.`,
  );
}
