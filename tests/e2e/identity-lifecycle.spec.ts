import { expect, test } from '@playwright/test';
import { mockCatalog } from './catalog-fixture';

const identity = { id: 1, name: 'Visitor', email: 'visitor@example.test' };

test('expired logout clears the account and leaves public discovery usable', async ({ page }) => {
  await mockCatalog(page);
  let signedIn = true;
  await page.route('**/sanctum/csrf-cookie', route => route.fulfill({ status: 204 }));
  await page.route('**/api/v1/me', route => route.fulfill(signedIn ? { json: { data: identity } } : { status: 401, json: {} }));
  await page.route('**/api/v1/auth/logout', async route => { signedIn = false; await route.fulfill({ status: 401, json: { code: 'unauthenticated' } }); });
  await page.goto('/account');
  await expect(page.getByText(identity.email, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.getByText(identity.email, { exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Characters', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
});

test('a failed logout keeps identity visible and retries only on a new explicit command', async ({ page }) => {
  let signedIn = true;
  let attempts = 0;
  await page.route('**/sanctum/csrf-cookie', route => route.fulfill({ status: 204 }));
  await page.route('**/api/v1/me', route => route.fulfill(signedIn ? { json: { data: identity } } : { status: 401, json: {} }));
  await page.route('**/api/v1/auth/logout', async route => {
    attempts++;
    signedIn = attempts === 1;
    await route.fulfill(signedIn ? { status: 503, json: { code: 'identity-unavailable', detail: 'unsafe server diagnostic' } } : { status: 204 });
  });
  await page.goto('/account');
  await expect(page.getByText(identity.email, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page.getByText(identity.email, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeEnabled();
  await expect(page).toHaveURL(/\/account$/);
  expect(attempts).toBe(1);
  await expect(page.getByText('unsafe server diagnostic')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(attempts).toBe(2);
});

for (const outcome of ['success', 'failure'] as const) {
  test(`leaving a pending sign in ignores its late ${outcome} without changing discovery or focus`, async ({ page }) => {
    await mockCatalog(page);
    let release!: () => void;
    let started!: () => void;
    let delivered!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const dispatched = new Promise<void>(resolve => { started = resolve; });
    const completed = new Promise<void>(resolve => { delivered = resolve; });
    await page.route('**/sanctum/csrf-cookie', route => route.fulfill({ status: 204 }));
    await page.route('**/api/v1/me', route => route.fulfill({ status: 401, json: {} }));
    await page.route('**/api/v1/auth/login', async route => {
      started();
      await gate;
      try {
        await route.fulfill(outcome === 'success' ? { json: { data: identity } } : { status: 503, json: {} });
      } finally { delivered(); }
    });
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(identity.email);
    await page.getByLabel('Password', { exact: true }).fill('valid-test-passphrase');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await dispatched;
    const cancelled = page.waitForEvent('requestfailed', request => new URL(request.url()).pathname === '/api/v1/auth/login');
    try {
      await page.getByRole('link', { name: 'Characters', exact: true }).click();
      expect((await cancelled).failure()?.errorText).toMatch(/abort/i);
      await expect(page.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
      await page.getByRole('searchbox', { name: 'Search characters', exact: true }).focus();
    } finally { release(); }
    await completed;
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('searchbox', { name: 'Search characters', exact: true })).toBeFocused();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}
