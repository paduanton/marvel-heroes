import { expect, test } from '@playwright/test';
import { mockCatalog } from './catalog-fixture';

const failures = [
  { status: 429, code: 'rate-limit-exceeded', message: 'Too many requests. Please wait before trying again.' },
  { status: 502, code: 'upstream-unavailable', message: 'Catalog is temporarily unavailable. Please try again later.' },
  { status: 503, code: 'upstream-budget-exhausted', message: 'Catalog is temporarily unavailable. Please try again later.' },
  { status: 503, code: 'cache-refresh-in-progress', message: 'Catalog is being refreshed. Please try again shortly.' },
];

for (const failure of failures) {
  test(`renders a stable ${failure.code} error and recovers only on manual retry`, async ({ page }) => {
    await mockCatalog(page);
    let attempts = 0;
    await page.route(url => url.pathname === '/api/v1/characters', async route => {
      attempts++;
      if (attempts === 1) {
        await route.fulfill({ status: failure.status, contentType: 'application/problem+json',
          json: { code: failure.code, detail: 'Private diagnostic that must not reach the screen.', request_id: 'test-request' } });
      } else await route.fallback();
    });
    await page.goto('/');
    await expect(page.getByRole('alert')).toHaveText(failure.message);
    await expect(page.getByText('Private diagnostic', { exact: false })).toHaveCount(0);
    expect(attempts).toBe(1);
    await page.getByRole('button', { name: 'Try characters again', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    expect(attempts).toBe(2);
  });
}

test('recovers from a connection failure without rendering transport diagnostics', async ({ page }) => {
  await mockCatalog(page);
  let attempts = 0;
  await page.route(url => url.pathname === '/api/v1/characters', async route => {
    attempts++;
    if (attempts === 1) await route.abort('failed');
    else await route.fallback();
  });
  await page.goto('/');
  await expect(page.getByRole('alert')).toHaveText('Unable to load the catalog right now.');
  await page.getByRole('button', { name: 'Try characters again', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
  expect(attempts).toBe(2);
});
