import { fork, spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';

const upstream = process.argv.includes('--upstream');
const nginx = process.argv.includes('--nginx') || upstream;
const forwardedArguments = process.argv.slice(2).filter(argument => !['--', '--nginx', '--upstream'].includes(argument));
const outputIsExplicit = forwardedArguments.some(argument => argument === '--output' || argument.startsWith('--output='));
const projects =
  nginx && !forwardedArguments.some(argument => argument === '--project' || argument.startsWith('--project='))
    ? ['desktop', 'mobile'].map(project => [`--project=${project}`, ...(outputIsExplicit ? [] : [`--output=test-results/${upstream ? 'upstream' : 'deployment'}/${project}`])])
    : [[]];

async function runStack(project) {
  const port = process.env.FULL_STACK_PORT ?? (nginx ? '4175' : '4174');
  const server = fork(resolve('tests/full-stack/server.mjs'), [], {
    stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    env: {
      ...process.env,
      FULL_STACK_TRANSPORT: nginx ? 'nginx' : 'php',
      FULL_STACK_UPSTREAM: upstream ? '1' : '0',
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
    tests = spawn(
      process.execPath,
      [
        'node_modules/@playwright/test/cli.js',
        'test',
        '--config',
        upstream ? 'playwright.upstream.config.ts' : nginx ? 'playwright.deployment.config.ts' : 'playwright.full-stack.config.ts',
        ...forwardedArguments,
        ...project,
      ],
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
for (const project of projects) {
  const code = await runStack(project);
  if (code !== 0) result = code;
  if (code === 130) break;
}
process.exitCode = result;
