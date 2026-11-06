import { fork, spawn } from 'node:child_process';
import { once } from 'node:events';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';

const upstream = process.argv.includes('--upstream');
const nginx = process.argv.includes('--nginx') || upstream;
const postman = process.argv.includes('--postman');
const forwardedArguments = process.argv.slice(2).filter(argument => !['--', '--nginx', '--upstream', '--postman'].includes(argument));
if (postman && (nginx || forwardedArguments.length > 0)) throw new Error('Run Postman without deployment or Playwright options.');
const outputIsExplicit = forwardedArguments.some(argument => argument === '--output' || argument.startsWith('--output='));
const projects =
  nginx && !forwardedArguments.some(argument => argument === '--project' || argument.startsWith('--project='))
    ? ['desktop', 'mobile'].map(project => [`--project=${project}`, ...(outputIsExplicit ? [] : [`--output=test-results/${upstream ? 'upstream' : 'deployment'}/${project}`])])
    : [[]];
const selective = forwardedArguments.some(argument => argument.endsWith('.spec.ts')
  || ['--grep', '--grep-invert', '-g'].includes(argument) || argument.startsWith('--grep=') || argument.startsWith('--grep-invert='));
const targets = upstream && !selective
  ? projects.flatMap(project => readdirSync(resolve('tests/upstream')).filter(file => file.endsWith('.spec.ts')).sort().map(file => [
    ...project.filter(argument => !argument.startsWith('--output=')), file,
    ...(outputIsExplicit ? [] : [`--output=test-results/upstream/${project.find(argument => argument.startsWith('--project='))?.slice(10) ?? 'selected'}/${file.replace('.spec.ts', '')}`]),
  ]))
  : projects;
if (targets.length === 0) throw new Error('No synthetic upstream test files were found.');

async function runStack(project) {
  const port = process.env.FULL_STACK_PORT ?? (postman ? '4176' : nginx ? '4175' : '4174');
  if (!/^[1-9][0-9]{0,4}$/.test(port) || Number(port) > 65535) throw new Error('Invalid disposable stack port.');
  const server = fork(resolve('tests/full-stack/server.mjs'), [], {
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    env: {
      ...process.env,
      FULL_STACK_TRANSPORT: nginx ? 'nginx' : 'php',
      FULL_STACK_UPSTREAM: upstream ? '1' : '0',
      FULL_STACK_LOCAL_CATALOG: postman ? '1' : '0',
      FULL_STACK_PORT: port,
    },
  });
  let tests;
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    tests?.kill();
    if (server.connected) server.send('stop');
  };
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);

  try {
    const [stack] = await Promise.race([
      once(server, 'message'),
      once(server, 'exit').then(() => {
        throw new Error('Disposable stack exited before startup.');
      }),
      setTimeout(120_000, undefined, { ref: false }).then(() => {
        throw new Error('Disposable stack startup timed out.');
      }),
    ]);
    if (stack?.type !== 'ready') throw new Error('Disposable stack did not confirm startup.');
    let ready = false;
    for (let attempt = 0; attempt < 60 && !interrupted; attempt++) {
      try {
        ready = (
          await fetch(`http://127.0.0.1:${port}/health`, {
            signal: AbortSignal.timeout(1000),
          })
        ).ok;
      } catch {
        /* Wait for HTTP readiness. */
      }
      if (ready) break;
      await setTimeout(500);
    }
    if (!ready || interrupted) throw new Error('Disposable HTTP service is not ready.');
    const command = postman ? (process.env.POSTMAN_CLI ?? 'postman') : process.execPath;
    const argumentsToRun = postman
      ? [
        'collection', 'run', 'docs/postman/marvel-heroes.postman_collection.json',
        '--env-var', `base_url=http://127.0.0.1:${port}`, '--env-var', 'allow_identity_writes=true',
      ]
      : [
        'node_modules/@playwright/test/cli.js',
        'test',
        '--config',
        upstream ? 'playwright.upstream.config.ts' : nginx ? 'playwright.deployment.config.ts' : 'playwright.full-stack.config.ts',
        ...forwardedArguments,
        ...project,
      ];
    tests = spawn(
      command,
      argumentsToRun,
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          FULL_STACK_PORT: port,
          ...(nginx
            ? {
                MARVEL_TEST_RUN: stack.run,
                MARVEL_TEST_REDIS: stack.redis,
                MARVEL_TEST_POSTGRES: stack.postgres,
                MARVEL_TEST_NETWORK: stack.network,
                ...(upstream ? { MARVEL_TEST_UPSTREAM: stack.upstream, MARVEL_TEST_APPLICATION: stack.application } : {}),
              }
            : {}),
        },
      },
    );
    const [code] = await once(tests, 'exit');
    return interrupted ? 130 : (code ?? 1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Integration validation failed.');
    return interrupted ? 130 : 1;
  } finally {
    if (server.exitCode === null && server.connected) {
      const ended = once(server, 'exit');
      server.send('stop');
      await ended;
    }
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}

let result = 0;
for (const project of targets) {
  const code = await runStack(project);
  if (code !== 0) result = code;
  if (code === 130) break;
}
process.exitCode = result;
