import { execFileSync } from 'node:child_process';
import { randomInt, randomUUID } from 'node:crypto';

type Mode = 'healthy' | 'redirect' | 'failure' | 'truncated' | 'malformed';
type Call = { path: string; method: string; signature_valid: boolean };

export function syntheticSource() {
  const run = process.env.MARVEL_TEST_RUN;
  const source = process.env.MARVEL_TEST_UPSTREAM;
  const application = process.env.MARVEL_TEST_APPLICATION;
  const network = process.env.MARVEL_TEST_NETWORK;
  if (!run || !/^marvel-http-test-[a-f0-9]{8}$/.test(run) || source !== `${run}-upstream`
    || application !== `${run}-app` || network !== `${run}-network`) {
    throw new Error('Run synthetic upstream tests through pnpm run test:upstream.');
  }
  for (const name of [source, application]) {
    const resource = JSON.parse(execFileSync('docker', ['inspect', name], { encoding: 'utf8' }))[0];
    if (resource.Config?.Labels?.['marvel-heroes.test-run'] !== run || !resource.NetworkSettings?.Networks?.[network]
      || Object.keys(resource.NetworkSettings.Networks).length !== 1 || Object.keys(resource.HostConfig?.PortBindings ?? {}).length !== 0) {
      throw new Error('Refusing to control an unowned test container.');
    }
  }
  const net = JSON.parse(execFileSync('docker', ['network', 'inspect', network], { encoding: 'utf8' }))[0];
  if (!net.Internal || net.Labels?.['marvel-heroes.test-run'] !== run) throw new Error('The upstream network must be isolated.');
  const state = { id: randomInt(100_000, 10_000_000), query: `http-${randomUUID()}`, mode: 'healthy' as Mode };
  function configure(mode: Mode, reset = false) {
    state.mode = mode;
    execFileSync('docker', ['exec', '--interactive', source!, 'php', '/tmp/deployment-upstream.php', 'configure'], {
      input: JSON.stringify({ ...state, reset_calls: reset }), stdio: ['pipe', 'ignore', 'pipe'],
    });
  }
  configure('healthy', true);
  return {
    id: state.id, query: state.query, name: `${state.query} Hero 1`,
    mode: configure,
    calls: () => JSON.parse(execFileSync('docker', ['exec', source, 'php', '/tmp/deployment-upstream.php', 'calls'], { encoding: 'utf8' })) as Call[],
  };
}
