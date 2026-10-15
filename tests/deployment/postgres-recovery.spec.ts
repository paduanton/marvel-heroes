import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import { expect, test, type APIResponse, type Response } from '@playwright/test';

function postgresOutage() {
  const run = process.env.MARVEL_TEST_RUN;
  const postgres = process.env.MARVEL_TEST_POSTGRES;
  const network = process.env.MARVEL_TEST_NETWORK;
  if (!run || !/^marvel-http-test-[a-f0-9]{8}$/.test(run) || postgres !== `${run}-postgres` || network !== `${run}-network`) {
    throw new Error('Run outage tests through pnpm run test:deployment.');
  }
  for (const args of [['inspect', postgres], ['network', 'inspect', network]]) {
    const resource = JSON.parse(execFileSync('docker', args, { encoding: 'utf8' }))[0];
    const labels = resource.Config?.Labels ?? resource.Labels;
    if (labels?.['marvel-heroes.test-run'] !== run) throw new Error('Refusing to modify an unowned test resource.');
  }
  let stopped = false;
  return {
    stop() {
      stopped = true;
      execFileSync('docker', ['stop', '--time', '5', postgres], { stdio: 'ignore', timeout: 15_000 });
    },
    async restore() {
      if (!stopped) return;
      execFileSync('docker', ['start', postgres], { stdio: 'ignore', timeout: 15_000 });
      for (let attempt = 0; attempt < 40; attempt++) {
        try {
          execFileSync('docker', ['exec', postgres, 'pg_isready', '-U', 'marvel', '-d', 'identity_test'], { stdio: 'ignore', timeout: 3000 });
          stopped = false;
          return;
        } catch { await setTimeout(250); }
      }
      throw new Error('Disposable PostgreSQL did not recover.');
    },
  };
}

async function expectIdentityUnavailable(response: APIResponse | Response) {
  expect(response.status()).toBe(503);
  const headers = response.headers();
  expect(headers['content-type']).toContain('application/problem+json');
  expect(headers['cache-control']).toBe('no-store, private');
  expect(headers.etag).toBeUndefined();
  expect(headers['x-request-id']).toBeTruthy();
  expect(await response.json()).toEqual({
    type: 'https://marvel-heroes.local/problems/identity-unavailable',
    title: 'identity unavailable', status: 503, code: 'identity-unavailable',
    detail: 'Identity is temporarily unavailable.', request_id: headers['x-request-id'],
  });
}

test('PostgreSQL loss preserves anonymous discovery and requires a manual login retry', async ({ page, request, context }) => {
  const outage = postgresOutage();
  const email = `postgres-login-${test.info().project.name}@example.test`;
  const password = 'valid-postgres-test-passphrase';
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  let loginRequests = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/v1/auth/login') loginRequests++; });
  try {
    outage.stop();
    const health = await request.get('/health');
    expect(health.status()).toBe(200);
    expect(health.headers()['set-cookie']).toBeUndefined();
    const readiness = await request.get('/ready');
    expect(readiness.status()).toBe(503);
    expect(await readiness.json()).toEqual({ status: 'not_ready' }); // Marvel credentials are intentionally absent.
    expect((await request.get('/sanctum/csrf-cookie')).status()).toBe(204);
    expect((await request.get('/api/v1/me')).status()).toBe(401);
    for (const path of ['/api/v1/characters', '/api/v1/characters/1', '/api/v1/characters/1/stories', '/api/v1/stories/101/comics']) {
      const catalog = await request.get(path);
      expect(catalog.status()).toBe(200);
      expect(catalog.headers()['cache-control']).toContain('public');
    }
    await page.getByRole('link', { name: 'Characters', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Account', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    const failed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/auth/login');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expectIdentityUnavailable(await failed);
    await expect(page.getByRole('alert')).toHaveText('Unable to access your account right now.');
    await expect(page.getByRole('alert')).toBeFocused();
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
    expect(loginRequests).toBe(1);
    expect((await context.request.get('/api/v1/me')).status()).toBe(401);
    await page.screenshot({ path: test.info().outputPath('postgres-login-outage.png'), fullPage: true });
    await outage.restore();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    expect(loginRequests).toBe(1);
    expect((await context.request.get('/api/v1/me')).status()).toBe(401);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    expect(loginRequests).toBe(2);
  } finally { await outage.restore(); }
});

test('PostgreSQL loss does not turn an authenticated session into an anonymous visitor', async ({ page, context }) => {
  const outage = postgresOutage();
  const email = `postgres-session-${test.info().project.name}@example.test`;
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('valid-postgres-test-passphrase');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  let identityRequests = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/v1/me') identityRequests++; });
  try {
    outage.stop();
    await expectIdentityUnavailable(await context.request.get('/api/v1/me', { headers: { 'If-None-Match': '*' } }));
    const failed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/me');
    await page.reload();
    await expectIdentityUnavailable(await failed);
    await expect(page).toHaveURL(/\/account$/);
    const alert = page.getByRole('alert');
    await expect(alert).toHaveText('Unable to access your account right now.Try again');
    await expect(alert).toBeFocused();
    await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
    expect(identityRequests).toBe(1);
    await page.screenshot({ path: test.info().outputPath('postgres-session-outage.png'), fullPage: true });
    await outage.restore();
    await expect(page).toHaveURL(/\/account$/);
    await expect(alert).toBeVisible();
    expect(identityRequests).toBe(1);
    const me = await context.request.get('/api/v1/me');
    expect(me.status()).toBe(200);
    expect(await me.json()).toMatchObject({ data: { email } });
    await page.getByRole('button', { name: 'Try again', exact: true }).click();
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    await expect(alert).toHaveCount(0);
    expect(identityRequests).toBe(2);
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    expect((await context.request.get('/api/v1/me')).status()).toBe(401);
  } finally { await outage.restore(); }
});

test('PostgreSQL loss leaves registration anonymous until an explicit successful retry', async ({ page, context }) => {
  const outage = postgresOutage();
  const email = `postgres-register-${randomUUID()}@example.test`;
  const password = 'valid-postgres-test-passphrase';
  await page.goto('/register');
  await page.getByLabel('Name', { exact: true }).fill('Registration Recovery Visitor');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  let registrationRequests = 0;
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/v1/auth/register') registrationRequests++; });
  try {
    outage.stop();
    const failed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/auth/register');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expectIdentityUnavailable(await failed);
    await expect(page).toHaveURL(/\/register$/);
    const alert = page.getByRole('alert');
    await expect(alert).toHaveText('Unable to access your account right now.');
    await expect(alert).toBeFocused();
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
    await expect(page.getByLabel('Confirm password', { exact: true })).toHaveValue('');
    expect(registrationRequests).toBe(1);
    expect((await context.request.get('/api/v1/me')).status()).toBe(401);
    await page.screenshot({ path: test.info().outputPath('postgres-registration-outage.png'), fullPage: true });
    await outage.restore();
    await expect(alert).toBeVisible();
    expect(registrationRequests).toBe(1);
    expect((await context.request.get('/api/v1/me')).status()).toBe(401);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm password', { exact: true }).fill(password);
    const created = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/auth/register');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    expect((await created).status()).toBe(201);
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByText(email, { exact: true })).toBeVisible();
    expect(registrationRequests).toBe(2);
  } finally { await outage.restore(); }
});
