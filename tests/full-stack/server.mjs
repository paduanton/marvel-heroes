import { execFileSync, spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';

const run = `marvel-http-test-${randomUUID().slice(0, 8)}`;
const network = `${run}-network`;
const postgres = `${run}-postgres`;
const redis = `${run}-redis`;
const application = `${run}-app`;
const image = process.env.FULL_STACK_IMAGE ?? 'marvel-heroes-testing-identity';
const port = process.env.FULL_STACK_PORT ?? '4174';
const env = { ...process.env, POSTGRES_PASSWORD: randomBytes(32).toString('hex'), APP_KEY: `base64:${randomBytes(32).toString('base64')}` };
env.DB_PASSWORD = env.POSTGRES_PASSWORD;
const containers = [];
let networkCreated = false;
let stopped = false;

function docker(args, options = {}) {
  return execFileSync('docker', args, { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'], ...options });
}

function cleanup() {
  if (stopped) return;
  stopped = true;
  for (const container of [...containers].reverse()) {
    try { docker(['rm', '--force', container]); } catch { /* Already removed. */ }
  }
  if (networkCreated) {
    try { docker(['network', 'rm', network]); } catch { /* Daemon may have stopped. */ }
  }
}

process.on('SIGINT', () => { cleanup(); process.exit(0); });
process.on('SIGTERM', () => { cleanup(); process.exit(0); });
process.on('exit', cleanup);
process.on('message', message => { if (message === 'stop') { cleanup(); process.exit(0); } });

async function ready(container, args) {
  for (let attempt = 0; attempt < 60; attempt++) {
    try { docker(['exec', container, ...args]); return; } catch { await setTimeout(500); }
  }
  throw new Error(`Disposable service failed to start: ${container}`);
}

try {
  execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { stdio: 'inherit' });
  docker(['network', 'create', network]);
  networkCreated = true;
  docker(['run', '--detach', '--rm', '--name', postgres, '--network', network, '--network-alias', 'postgres', '--env', 'POSTGRES_PASSWORD', '--env', 'POSTGRES_USER=marvel', '--env', 'POSTGRES_DB=identity_test', 'postgres:17-alpine']);
  containers.push(postgres);
  docker(['run', '--detach', '--rm', '--name', redis, '--network', network, '--network-alias', 'redis', 'redis:7.4-alpine', 'redis-server', '--save', '', '--appendonly', 'no']);
  containers.push(redis);
  await ready(postgres, ['pg_isready', '-U', 'marvel', '-d', 'identity_test']);
  await ready(redis, ['redis-cli', 'ping']);
  const settings = [
    'APP_ENV=integration', 'APP_DEBUG=false', 'APP_NAME=Marvel Heroes', 'APP_KEY', 'MARVEL_HTTP_TEST=1',
    `APP_URL=http://127.0.0.1:${port}`, `SANCTUM_STATEFUL_DOMAINS=127.0.0.1:${port}`,
    'DB_CONNECTION=pgsql', 'DB_HOST=postgres', 'DB_PORT=5432', 'DB_DATABASE=identity_test', 'DB_USERNAME=marvel', 'DB_PASSWORD',
    'CACHE_STORE=redis', 'REDIS_HOST=redis', 'SESSION_DRIVER=redis', 'SESSION_SECURE_COOKIE=false',
  ].flatMap(value => ['--env', value]);
  const mounts = ['app', 'routes', 'config', 'database', 'resources/views', 'public/build', 'tests/Support', 'bootstrap/app.php']
    .flatMap(path => ['--mount', `type=bind,source=${resolve(path)},target=/var/www/html/${path},readonly`]);
  const common = ['--network', network, ...settings, ...mounts, '--entrypoint', 'php', image];
  // This network and database were created above; no host database or volumes are mounted.
  docker(['run', '--rm', ...common, 'artisan', 'migrate', '--force'], { stdio: 'inherit' });
  docker(['run', '--detach', '--rm', '--name', application, '--publish', `127.0.0.1:${port}:8000`, ...common, '-S', '0.0.0.0:8000', '-t', 'public', 'tests/Support/browser-router.php']);
  containers.push(application);
  process.send?.('ready');
  const logs = spawn('docker', ['logs', '--follow', application], { stdio: 'ignore' });
  logs.on('exit', code => { if (!stopped) { cleanup(); process.exit(code || 1); } });
  await new Promise(() => {});
} catch (error) {
  cleanup();
  // Do not echo child-process arguments or environment values.
  console.error(error instanceof Error ? error.message.split('\n')[0] : 'Disposable stack failed.');
  process.exit(1);
}
