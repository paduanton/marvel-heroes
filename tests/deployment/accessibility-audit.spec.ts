import { expect, test } from '@playwright/test';
import { audit } from '../Support/accessibility';

test('compiled catalog and related pages pass local accessibility audits through FPM', async ({ page }, testInfo) => {
  const externalRequests: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.hostname !== '127.0.0.1') externalRequests.push(url.hostname);
  });
  for (const screen of [
    { url: '/', region: 'Character results', title: 'Spider-Man', report: 'catalog' },
    { url: '/characters/1?stories_page=2', region: 'Related stories', title: 'A new beginning', report: 'stories' },
    { url: '/stories/111/comics?comics_page=2&stories_page=2&character=1', region: 'Comic results', title: 'Amazing Spider-Man #21', report: 'comics' },
  ]) {
    await page.goto(screen.url);
    await expect(page.getByRole('region', { name: screen.region, exact: true }).getByRole('heading', { name: screen.title, exact: true })).toBeVisible();
    await audit(page, testInfo, screen.report);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(externalRequests).toEqual([]);
});

test('real catalog failure and recovery remain accessible without raw upstream details', async ({ page }, testInfo) => {
  const failed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/characters');
  await page.goto('/?query=uncached');
  const response = await failed;
  expect(response.status()).toBe(502);
  expect(response.headers().etag).toBeUndefined();
  expect(await response.json()).toMatchObject({ code: 'upstream-unavailable' });
  await expect(page.getByRole('alert')).toHaveText('Catalog is temporarily unavailable. Please try again later.');
  await audit(page, testInfo, 'catalog-error');
  await page.getByRole('searchbox', { name: 'Search characters' }).focus();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await audit(page, testInfo, 'catalog-recovered');
});

test('real identity forms, validation, session and logout remain accessible', async ({ page, context }, testInfo) => {
  const email = `postgres-login-${testInfo.project.name}@example.test`;
  const password = 'valid-postgres-test-passphrase';
  await page.goto('/register');
  await expect(page.getByRole('button', { name: 'Create account', exact: true })).toBeVisible();
  await audit(page, testInfo, 'register');
  await page.getByLabel('Name', { exact: true }).fill('Accessibility Visitor');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill('another-valid-test-passphrase');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toBeFocused();
  await audit(page, testInfo, 'registration-validation');
  await page.getByRole('link', { name: 'Already have an account? Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
  await audit(page, testInfo, 'login');
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('incorrect-test-passphrase');
  const rejected = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/auth/login');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  expect((await rejected).status()).toBe(422);
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await audit(page, testInfo, 'login-validation');
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText(email, { exact: true })).toBeVisible();
  await audit(page, testInfo, 'account');
  const me = await context.request.get('/api/v1/me');
  expect(me.status()).toBe(200);
  expect(me.headers()['cache-control']).toBe('no-store, private');
  expect(me.headers().etag).toBeUndefined();
  expect(Object.keys((await me.json()).data).sort()).toEqual(['email', 'id', 'name']);
  expect((await context.cookies()).find(cookie => cookie.name === 'marvel_heroes_session')).toMatchObject({ httpOnly: true, sameSite: 'Lax' });
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.request.get('/api/v1/me')).status()).toBe(401);
  await audit(page, testInfo, 'signed-out');
});
