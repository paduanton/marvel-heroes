import { execFileSync, spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';

const run = `marvel-http-test-${randomUUID().slice(0, 8)}`;
const network = `${run}-network`;
const edgeNetwork = `${run}-edge`;
const postgres = `${run}-postgres`;
const redis = `${run}-redis`;
const application = `${run}-app`;
const web = `${run}-web`;
const nginx = process.env.FULL_STACK_TRANSPORT === 'nginx';
const image = process.env.FULL_STACK_IMAGE ?? (nginx ? 'marvel-heroes-deployment-app' : 'marvel-heroes-testing-identity');
const webImage = process.env.FULL_STACK_WEB_IMAGE ?? 'marvel-heroes-deployment-web';
const port = process.env.FULL_STACK_PORT ?? '4174';
const env = { ...process.env, POSTGRES_PASSWORD: randomBytes(32).toString('hex'), APP_KEY: `base64:${randomBytes(32).toString('base64')}` };
env.DB_PASSWORD = env.POSTGRES_PASSWORD;
const containers = [];
let networkCreated = false;
let edgeNetworkCreated = false;
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
  if (edgeNetworkCreated) {
    try { docker(['network', 'rm', edgeNetwork]); } catch { /* Daemon may have stopped. */ }
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
  if (!nginx) execFileSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build'], { stdio: 'inherit' });
  docker(['network', 'create', '--label', `marvel-heroes.test-run=${run}`, ...(nginx ? ['--internal'] : []), network]);
  networkCreated = true;
  if (nginx) {
    docker(['network', 'create', edgeNetwork]);
    edgeNetworkCreated = true;
  }
  docker(['run', '--detach', '--rm', '--name', postgres, '--network', network, '--network-alias', 'postgres', '--env', 'POSTGRES_PASSWORD', '--env', 'POSTGRES_USER=marvel', '--env', 'POSTGRES_DB=identity_test', 'postgres:17-alpine']);
  containers.push(postgres);
  docker(['run', '--detach', '--rm', '--name', redis, '--network', network, '--network-alias', 'redis', '--label', `marvel-heroes.test-run=${run}`, 'redis:7.4-alpine', 'redis-server', '--save', '', '--appendonly', 'no']);
  containers.push(redis);
  await ready(postgres, ['pg_isready', '-U', 'marvel', '-d', 'identity_test']);
  await ready(redis, ['redis-cli', 'ping']);
  const settings = [
    'APP_ENV=integration', 'APP_DEBUG=false', 'APP_NAME=Marvel Heroes', 'APP_KEY',
    nginx ? 'MARVEL_DEPLOYMENT_TEST=1' : 'MARVEL_HTTP_TEST=1',
    `APP_URL=http://127.0.0.1:${port}`, `SANCTUM_STATEFUL_DOMAINS=127.0.0.1:${port}`,
    'DB_CONNECTION=pgsql', 'DB_HOST=postgres', 'DB_PORT=5432', 'DB_DATABASE=identity_test', 'DB_USERNAME=marvel', 'DB_PASSWORD',
    'CACHE_STORE=redis', 'REDIS_HOST=redis', 'SESSION_DRIVER=redis', 'SESSION_SECURE_COOKIE=false',
  ].flatMap(value => ['--env', value]);
  const mounts = (nginx ? [] : ['app', 'routes', 'config', 'database', 'resources/views', 'public/build', 'tests/Support', 'bootstrap/app.php'])
    .flatMap(path => ['--mount', `type=bind,source=${resolve(path)},target=/var/www/html/${path},readonly`]);
  const common = ['--network', network, ...settings, ...mounts, '--entrypoint', 'php', image];
  // This network and database were created above; no host database or volumes are mounted.
  docker(['run', '--rm', ...common, 'artisan', 'migrate', '--force'], { stdio: 'inherit' });
  if (nginx) {
    docker(['run', '--rm', '--mount', `type=bind,source=${resolve('tests/Support/deployment-seed.php')},target=/tmp/deployment-seed.php,readonly`, ...common, '/tmp/deployment-seed.php'], { stdio: 'inherit' });
    docker(['run', '--detach', '--rm', '--name', application, '--network', network, '--network-alias', 'app', ...settings, image]);
    containers.push(application);
    docker(['create', '--rm', '--name', web, '--network', network, '--publish', `127.0.0.1:${port}:80`, webImage]);
    containers.push(web);
    docker(['network', 'connect', edgeNetwork, web]);
    docker(['start', web]);
  } else {
    docker(['run', '--detach', '--rm', '--name', application, '--publish', `127.0.0.1:${port}:8000`, ...common, '-S', '0.0.0.0:8000', '-t', 'public', 'tests/Support/browser-router.php']);
    containers.push(application);
  }
  process.send?.({ type: 'ready', run, redis, network });
  const logs = spawn('docker', ['logs', '--follow', application], { stdio: 'ignore' });
  logs.on('exit', code => { if (!stopped) { cleanup(); process.exit(code || 1); } });
  await new Promise(() => {});
} catch (error) {
  cleanup();
  // Do not echo child-process arguments or environment values.
  console.error(error instanceof Error ? error.message.split('\n')[0] : 'Disposable stack failed.');
  process.exit(1);
}
