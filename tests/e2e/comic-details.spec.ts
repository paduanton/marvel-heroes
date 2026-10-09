import { expect, test } from '@playwright/test';
import type { Comic } from '../../resources/js/types/catalog';
import { mockCatalog } from './catalog-fixture';

test('shows publication metadata without confusing missing comic descriptions with characters', async ({ page }, testInfo) => {
  await mockCatalog(page);
  const comic: Comic = {
    id: 1001, title: 'Amazing Spider-Man #1', description: null, format: 'Comic',
    modified_at: null, on_sale_at: '2020-01-02T12:00:00Z', digital_price: null, image_url: null,
  };
  await page.route(url => url.pathname === '/api/v1/stories/101/comics', route => route.fulfill({ json: {
    data: [comic, { ...comic, id: 1002, title: 'Second issue', description: 'An official comic description.', on_sale_at: null }],
    meta: { page: 1, per_page: 20, total: 2 },
  } }));
  await page.goto('/stories/101/comics');
  const cards = page.getByRole('region', { name: 'Comic results', exact: true }).getByRole('article');
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0).getByText('No official description is available for this comic.', { exact: true })).toBeVisible();
  await expect(cards.nth(0).locator('time')).toHaveText('Jan 2, 2020');
  await expect(cards.nth(0).locator('time')).toHaveAttribute('datetime', '2020-01-02T12:00:00Z');
  await expect(cards.nth(1).getByText('An official comic description.', { exact: true })).toBeVisible();
  await expect(cards.nth(1).locator('time')).toHaveCount(0);
  await expect(page.getByText('No official description is available for this character.', { exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('comic-metadata.png'), fullPage: true });
});
