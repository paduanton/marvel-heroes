import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('real session registration, reload, logout and login preserve public discovery', async ({ page, context }) => {
  const email = `visitor-${randomUUID()}@example.test`;
  const password = 'valid-browser-test-passphrase';
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Account', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('link', { name: 'Create an account', exact: true }).click();
  await page.getByLabel('Name', { exact: true }).fill('Browser Visitor');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  const cookies = await context.cookies();
  expect(cookies.find(cookie => cookie.name === 'marvel_heroes_session')).toMatchObject({ httpOnly: true, sameSite: 'Lax' });
  expect(cookies.find(cookie => cookie.name === 'XSRF-TOKEN')).toMatchObject({ httpOnly: false, sameSite: 'Lax' });
  await expect(page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage) }))).resolves.toEqual({ local: [], session: [] });
  const me = await context.request.get('/api/v1/me', { headers: { 'If-None-Match': '*' } });
  expect(me.status()).toBe(200);
  expect(me.headers()['cache-control']).toBe('no-store, private');
  expect(me.headers().etag).toBeUndefined();
  await page.screenshot({ path: test.info().outputPath('account.png'), fullPage: true });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.request.get('/api/v1/me')).status()).toBe(401);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await page.getByRole('link', { name: 'Browse characters' }).click();
  await expect(page.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
  const catalog = await context.request.get('/api/v1/characters');
  expect(catalog.headers()['cache-control']).toContain('public');
  expect((await context.request.get('/api/v1/characters', { headers: { 'If-None-Match': catalog.headers().etag } })).status()).toBe(304);
});

test('real HTTP rejects missing and incorrect CSRF tokens without issuing an identity', async ({ request }) => {
  await request.get('/sanctum/csrf-cookie');
  const data = { name: 'Rejected visitor', email: `${randomUUID()}@example.test`, password: 'valid-browser-test-passphrase', password_confirmation: 'valid-browser-test-passphrase' };
  const attempts: Record<string, string>[] = [{}, { 'X-XSRF-TOKEN': 'incorrect-token' }];
  for (const headers of attempts) {
    const response = await request.post('/api/v1/auth/register', { data, headers });
    expect(response.status()).toBe(419);
    expect(await response.json()).toMatchObject({ code: 'csrf-mismatch', status: 419 });
    expect(response.headers()['cache-control']).toBe('no-store, private');
  }
  expect((await request.get('/api/v1/me')).status()).toBe(401);
});

test('PostgreSQL rejects duplicate normalized emails across independent sessions', async ({ request, playwright, baseURL }) => {
  test.skip(test.info().project.name !== 'desktop', 'One database uniqueness check is sufficient.');
  await request.get('/sanctum/csrf-cookie');
  const state = await request.storageState();
  const csrf = state.cookies.find(cookie => cookie.name === 'XSRF-TOKEN')!;
  const other = await playwright.request.newContext({ baseURL });
  await other.get('/sanctum/csrf-cookie');
  const otherCsrf = (await other.storageState()).cookies.find(cookie => cookie.name === 'XSRF-TOKEN')!;
  const email = `${randomUUID()}@example.test`;
  const data = { name: 'Concurrent visitor', email, password: 'valid-browser-test-passphrase', password_confirmation: 'valid-browser-test-passphrase' };
  try {
    const responses = await Promise.all([
    request.post('/api/v1/auth/register', { data, headers: { 'X-XSRF-TOKEN': decodeURIComponent(csrf.value) } }),
      other.post('/api/v1/auth/register', { data: { ...data, email: ` ${email.toUpperCase()} ` }, headers: { 'X-XSRF-TOKEN': decodeURIComponent(otherCsrf.value) } }),
    ]);
    expect(responses.map(response => response.status()).sort()).toEqual([201, 422]);
    const rejected = responses.find(response => response.status() === 422)!;
    expect(await rejected.json()).toMatchObject({ code: 'validation-failed' });
  } finally { await other.dispose(); }
});
