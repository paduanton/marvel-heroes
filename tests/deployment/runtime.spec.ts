import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('built assets and discovery work through Nginx and PHP-FPM, including direct SPA links', async ({ page, request }) => {
  const assetResponses: { status: number; type: string }[] = [];
  page.on('response', response => {
    if (new URL(response.url()).pathname.startsWith('/build/')) {
      assetResponses.push({ status: response.status(), type: response.headers()['content-type'] });
    }
  });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
  expect(assetResponses.some(asset => asset.status === 200 && asset.type.includes('javascript'))).toBe(true);
  expect(assetResponses.some(asset => asset.status === 200 && asset.type.includes('text/css'))).toBe(true);
  await page.getByRole('link', { name: 'Spider-Man', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Origin of a hero', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'View comics', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Amazing Spider-Man #1', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Amazing Spider-Man #1', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('nginx-discovery.png'), fullPage: true });

  const catalog = await request.get('/api/v1/characters');
  expect(catalog.status()).toBe(200);
  expect(catalog.headers()['x-powered-by']).toBeUndefined();
  expect(catalog.headers()['x-content-type-options']).toBe('nosniff');
  expect(catalog.headers()['x-request-id']).toBeTruthy();
  expect(catalog.headers()['cache-control']).toContain('public');
  const unchanged = await request.get('/api/v1/characters', { headers: { 'If-None-Match': `"other", W/${catalog.headers().etag}` } });
  expect(unchanged.status()).toBe(304);
  expect(await unchanged.body()).toHaveLength(0);
});

test('real FPM sessions enforce CSRF and survive reload before logout', async ({ page, context }) => {
  const email = `deployment-${randomUUID()}@example.test`;
  await page.goto('/register');
  await page.getByLabel('Name', { exact: true }).fill('Deployment Visitor');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('valid-deployment-passphrase');
  await page.getByLabel('Confirm password', { exact: true }).fill('valid-deployment-passphrase');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  expect((await context.cookies()).find(cookie => cookie.name === 'marvel_heroes_session')).toMatchObject({ httpOnly: true, sameSite: 'Lax' });
  const me = await context.request.get('/api/v1/me', { headers: { 'If-None-Match': '*' } });
  expect(me.status()).toBe(200);
  expect(me.headers()['cache-control']).toBe('no-store, private');
  expect(me.headers().etag).toBeUndefined();
  const rejected = await context.request.post('/api/v1/auth/logout');
  expect(rejected.status()).toBe(419);
  expect(await rejected.json()).toMatchObject({ code: 'csrf-mismatch' });
  expect((await context.request.get('/api/v1/me')).status()).toBe(200);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.request.get('/api/v1/me')).status()).toBe(401);
});

test('deployment entrypoints reject invalid input and fail safely without upstream credentials', async ({ request }) => {
  expect((await request.get('/health')).status()).toBe(200);
  expect((await request.get('/ready')).status()).toBe(503);
  expect((await request.get('/.env')).status()).toBe(403);
  for (const path of ['/api/v1/unknown', '/api/v1/characters/999999999999999999999999999']) {
    const response = await request.get(path);
    expect(response.status()).toBe(404);
    expect(response.headers()['content-type']).toContain('application/problem+json');
    expect(await response.json()).toMatchObject({ code: 'resource-not-found' });
  }
  const invalidPage = await request.get('/api/v1/characters?page=9223372036854775807&per_page=100');
  expect(invalidPage.status()).toBe(422);
  expect(await invalidPage.json()).toMatchObject({ code: 'validation-failed' });
  const miss = await request.get('/api/v1/characters?query=uncached');
  expect(miss.status()).toBe(502);
  expect(await miss.json()).toMatchObject({ code: 'upstream-unavailable' });
  expect((await request.get('/api/v1/characters')).status()).toBe(200);
});
