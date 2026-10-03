import { spawn } from 'node:child_process';
const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54329',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'local-test-key',
  NEXT_TELEMETRY_DISABLED: '1',
  E2E_EXTERNAL_SERVER: '1',
};
const children = [];
function start(args, foreground = false) {
  const child = spawn(process.execPath, args, {
    env,
    stdio: foreground ? 'inherit' : ['ignore', 'ignore', 'inherit'],
    windowsHide: true,
  });
  children.push(child);
  return child;
}
async function ready(url, child) {
  for (let i = 0; i < 150; i++) {
    if (child.exitCode !== null) throw new Error('Servidor de pruebas detenido.');
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1500) })).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Servidor de pruebas no respondió.');
}
async function stop(child) {
  if (child.exitCode !== null) return;
  if (process.platform === 'win32') {
    await new Promise((resolve) => {
      const kill = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
      const timeout = setTimeout(() => {
        kill.kill();
        resolve();
      }, 5000);
      kill.once('exit', () => {
        clearTimeout(timeout);
        resolve();
      });
      kill.once('error', () => {
        clearTimeout(timeout);
        child.kill();
        resolve();
      });
    });
  } else child.kill('SIGTERM');
  child.unref();
  child.stderr?.destroy();
}
let status = 1;
try {
  const db = start(['tests/local-supabase.mjs']);
  await ready('http://127.0.0.1:54329/health', db);
  const web = start(['node_modules/next/dist/bin/next', 'dev', '--port', '3100']);
  await ready('http://127.0.0.1:3100', web);
  const test = start(['node_modules/@playwright/test/cli.js', 'test'], true);
  status = await new Promise((resolve) => test.once('exit', (code) => resolve(code ?? 1)));
} catch (e) {
  console.error(e.message);
} finally {
  for (const child of children.reverse()) await stop(child);
}
process.exit(status);
