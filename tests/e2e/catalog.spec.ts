import { expect, test } from '@playwright/test';
import { mockCatalog } from './catalog-fixture';

test('renders the compiled character catalog', async ({ page }) => {
  await mockCatalog(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Discover Marvel characters', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Spider-Man', exact: true })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Search characters' })).toBeVisible();
});
