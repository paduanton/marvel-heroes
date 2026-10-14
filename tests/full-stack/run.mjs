import { fork, spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';

const server = fork(resolve('tests/full-stack/server.mjs'), [], { stdio: ['inherit', 'inherit', 'inherit', 'ipc'] });
const port = process.env.FULL_STACK_PORT ?? '4174';
let tests;
let interrupted = false;
process.on('SIGINT', () => { interrupted = true; tests?.kill(); if (server.connected) server.send('stop'); });
process.on('SIGTERM', () => { interrupted = true; tests?.kill(); if (server.connected) server.send('stop'); });

try {
  await Promise.race([
    once(server, 'message'),
    once(server, 'exit').then(() => { throw new Error('Disposable stack exited before startup.'); }),
    setTimeout(120_000, undefined, { ref: false }).then(() => { throw new Error('Disposable stack startup timed out.'); }),
  ]);
  let ready = false;
  for (let attempt = 0; attempt < 60 && !interrupted; attempt++) {
    try { ready = (await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1000) })).ok; } catch { /* Wait for HTTP readiness. */ }
    if (ready) break;
    await setTimeout(500);
  }
  if (!ready || interrupted) throw new Error('Disposable HTTP service is not ready.');
  tests = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.full-stack.config.ts', ...process.argv.slice(2).filter(argument => argument !== '--')], { stdio: 'inherit' });
  const [code] = await once(tests, 'exit');
  process.exitCode = code ?? 1;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Integration validation failed.');
  process.exitCode = 1;
} finally {
  if (server.exitCode === null && server.connected) {
    const ended = once(server, 'exit');
    server.send('stop');
    await ended;
  }
}
