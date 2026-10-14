import { expect, test } from '@playwright/test';

const identity = { id: 1, name: 'Visitor', email: 'visitor@example.test' };

test('account load failure remains an error and recovers on explicit retry', async ({ page }) => {
  let requests = 0;
  await page.route('**/api/v1/me', async route => {
    requests++;
    await route.fulfill(requests === 1 ? { status: 503, json: { code: 'identity-unavailable', detail: 'unsafe database detail' } } : { json: { data: identity } });
  });
  await page.goto('/account');
  await expect(page.getByRole('alert')).toContainText('Unable to access your account right now.');
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText('unsafe database detail')).toHaveCount(0);
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.getByText(identity.email, { exact: true })).toBeVisible();
  expect(requests).toBe(2);
});

test('sign in rejects unsafe diagnostics, clears the password and allows a manual retry', async ({ page }) => {
  let signedIn = false;
  let attempts = 0;
  let bootstraps = 0;
  await page.route('**/sanctum/csrf-cookie', async route => { bootstraps++; await route.fulfill({ status: 204 }); });
  await page.route('**/api/v1/me', async route => { await route.fulfill(signedIn ? { json: { data: identity } } : { status: 401, json: { code: 'unauthenticated' } }); });
  await page.route('**/api/v1/auth/login', async route => {
    attempts++;
    signedIn = attempts === 2;
    await route.fulfill(signedIn ? { json: { data: identity } } : { status: 422, json: { code: 'validation-failed', detail: 'unsafe database detail', errors: { email: ['unsafe credential detail'] } } });
  });
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill(identity.email);
  await page.getByLabel('Password', { exact: true }).fill('valid-test-passphrase');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page.getByRole('alert')).toContainText('Check your details and try again.');
  await expect(page.getByLabel('Email', { exact: true })).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
  await expect(page.getByText(/unsafe (database|credential) detail/)).toHaveCount(0);
  expect(attempts).toBe(1);
  await page.getByLabel('Password', { exact: true }).fill('valid-test-passphrase');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByText(identity.email, { exact: true })).toBeVisible();
  expect(bootstraps).toBe(2);
});

test('registration disables duplicate submissions while pending and fits a narrow viewport', async ({ page }) => {
  let signedIn = false;
  let attempts = 0;
  let release!: () => void;
  const response = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/sanctum/csrf-cookie', async route => { await route.fulfill({ status: 204 }); });
  await page.route('**/api/v1/me', async route => { await route.fulfill(signedIn ? { json: { data: identity } } : { status: 401, json: {} }); });
  await page.route('**/api/v1/auth/register', async route => {
    attempts++;
    await response;
    signedIn = true;
    await route.fulfill({ status: 201, json: { data: identity } });
  });
  await page.goto('/register');
  await page.getByLabel('Name', { exact: true }).fill(identity.name);
  await page.getByLabel('Email', { exact: true }).fill(identity.email);
  await page.getByLabel('Password', { exact: true }).fill('valid-test-passphrase');
  await page.getByLabel('Confirm password', { exact: true }).fill('valid-test-passphrase');
  await page.screenshot({ path: test.info().outputPath('registration.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  try {
    await expect(page.getByRole('button', { name: 'Please wait...', exact: true })).toBeDisabled();
    await expect(page.getByLabel('Password', { exact: true })).toBeDisabled();
    expect(attempts).toBe(1);
  } finally { release(); }
  await expect(page).toHaveURL(/\/account$/);
  expect(attempts).toBe(1);
});

test('registration explains byte limits and confirmation errors before any session mutation', async ({ page }) => {
  let signedIn = false;
  let bootstraps = 0;
  let attempts = 0;
  await page.route('**/sanctum/csrf-cookie', async route => { bootstraps++; await route.fulfill({ status: 204 }); });
  await page.route('**/api/v1/me', async route => { await route.fulfill(signedIn ? { json: { data: identity } } : { status: 401, json: {} }); });
  await page.route('**/api/v1/auth/register', async route => { attempts++; signedIn = true; await route.fulfill({ status: 201, json: { data: identity } }); });
  await page.goto('/register');
  await page.getByLabel('Name', { exact: true }).fill(identity.name);
  await page.getByLabel('Email', { exact: true }).fill(identity.email);
  await page.getByLabel('Password', { exact: true }).fill('\u00e9'.repeat(40));
  await page.getByLabel('Confirm password', { exact: true }).fill('different-passphrase');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page.getByText('Use a password of at most 72 UTF-8 bytes.', { exact: true })).toBeVisible();
  await expect(page.getByText('Enter the same password in both fields.', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('aria-describedby', /password-error/);
  await expect(page.getByLabel('Confirm password', { exact: true })).toHaveAttribute('aria-describedby', 'confirmation-error');
  expect(bootstraps).toBe(0);
  expect(attempts).toBe(0);
  await page.screenshot({ path: test.info().outputPath('registration-errors.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByLabel('Password', { exact: true }).fill('valid-test-passphrase');
  await page.getByLabel('Confirm password', { exact: true }).fill('valid-test-passphrase');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page).toHaveURL(/\/account$/);
  expect(bootstraps).toBe(1);
  expect(attempts).toBe(1);
});
