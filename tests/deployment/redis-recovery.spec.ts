import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

function redisOutage() {
  const run = process.env.MARVEL_TEST_RUN;
  const redis = process.env.MARVEL_TEST_REDIS;
  const network = process.env.MARVEL_TEST_NETWORK;
  if (!run || !/^marvel-http-test-[a-f0-9]{8}$/.test(run) || redis !== `${run}-redis` || network !== `${run}-network`) {
    throw new Error('Run outage tests through pnpm run test:deployment.');
  }
  for (const args of [['inspect', redis], ['network', 'inspect', network]]) {
    const resource = JSON.parse(execFileSync('docker', args, { encoding: 'utf8' }))[0];
    const labels = resource.Config?.Labels ?? resource.Labels;
    if (labels?.['marvel-heroes.test-run'] !== run) throw new Error('Refusing to modify an unowned test resource.');
  }
  let paused = false;
  return {
    pause() {
      execFileSync('docker', ['pause', redis], { stdio: 'ignore' });
      paused = true;
    },
    restore() {
      if (!paused) return;
      execFileSync('docker', ['unpause', redis], { stdio: 'ignore' });
      paused = false;
    },
  };
}

test('Redis loss preserves liveness, closes API access and recovers catalog only on manual retry', async ({ page, request }) => {
  const outage = redisOutage();
  let catalogRequests = 0;
  // Pass-through routing disables the browser HTTP cache; responses still come from Nginx/FPM.
  await page.route('**/api/v1/**', route => route.continue());
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/v1/characters') catalogRequests++; });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
  try {
    outage.pause();
    const health = await request.get('/health');
    expect(health.status()).toBe(200);
    expect(await health.json()).toEqual({ status: 'ok' });
    expect(health.headers()['set-cookie']).toBeUndefined();
    const readiness = await request.get('/ready');
    expect(readiness.status()).toBe(503);
    expect(await readiness.json()).toEqual({ status: 'not_ready' });
    for (const path of ['/api/v1/characters', '/api/v1/characters/1', '/api/v1/characters/1/stories', '/api/v1/stories/101/comics', '/api/v1/me', '/sanctum/csrf-cookie']) {
      const failed = await request.get(path);
      expect(failed.status()).toBe(503);
      expect(failed.headers()['content-type']).toContain('application/problem+json');
      expect(failed.headers()['x-request-id']).toBeTruthy();
      expect(failed.headers().etag).toBeUndefined();
      expect(await failed.json()).toMatchObject({ code: 'dependency-unavailable', status: 503, request_id: failed.headers()['x-request-id'] });
    }
    await page.getByRole('searchbox', { name: 'Search characters' }).fill('sp');
    const alert = page.getByRole('alert');
    await expect(alert).toHaveText('Catalog is temporarily unavailable. Please try again later.');
    expect(catalogRequests).toBe(2);
    await page.screenshot({ path: test.info().outputPath('redis-catalog-outage.png'), fullPage: true });
    outage.restore();
    await expect(alert).toBeVisible();
    expect(catalogRequests).toBe(2);
    await page.getByRole('button', { name: 'Try characters again', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
    await expect(alert).toHaveCount(0);
    expect(catalogRequests).toBe(3);
    expect((await request.get('/health')).status()).toBe(200);
    expect((await request.get('/api/v1/me')).status()).toBe(401);
  } finally { outage.restore(); }
});

test('Redis loss does not replay logout or discard the authenticated session', async ({ page, context }) => {
  const outage = redisOutage();
  const email = `redis-${randomUUID()}@example.test`;
  let logoutRequests = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/v1/auth/logout') logoutRequests++; });
  await page.goto('/register');
  await page.getByLabel('Name', { exact: true }).fill('Redis Recovery Visitor');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('valid-redis-test-passphrase');
  await page.getByLabel('Confirm password', { exact: true }).fill('valid-redis-test-passphrase');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  try {
    outage.pause();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Unable to access your account right now.');
    await expect(page.getByRole('alert')).toBeFocused();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/account$/);
    expect(logoutRequests).toBe(0);
    outage.restore();
    const me = await context.request.get('/api/v1/me');
    expect(me.status()).toBe(200);
    expect(await me.json()).toMatchObject({ data: { email } });
    expect(logoutRequests).toBe(0);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect(logoutRequests).toBe(1);
    expect((await context.request.get('/api/v1/me')).status()).toBe(401);
  } finally { outage.restore(); }
});
