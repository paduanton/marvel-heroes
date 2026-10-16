import { expect, test } from '@playwright/test';
import { mockCatalog } from './catalog-fixture';

const collections = [
  { url: '/', path: '/api/v1/characters', region: 'Character results', size: 20, name: 'Thor', record: { id: 1, name: 'Archive character', description: 'A catalog entry.', image_url: null, modified_at: null } },
  { url: '/characters/1', path: '/api/v1/characters/1/stories', region: 'Related stories', size: 10, name: 'Next adventure', record: { id: 101, title: 'Archive story', type: 'story', counts: { comics: 1 }, modified_at: null } },
  { url: '/stories/101/comics', path: '/api/v1/stories/101/comics', region: 'Comic results', size: 20, name: 'Amazing Spider-Man #2', record: { id: 1001, title: 'Archive comic', description: 'A catalog entry.', image_url: null, modified_at: null, on_sale_at: null, digital_price: null, format: 'Comic' } },
];

for (const collection of collections) {
  for (const input of ['pointer', 'keyboard']) {
    test(`reveals new ${collection.region} after ${input} pagination of a long list`, async ({ page }) => {
      await mockCatalog(page);
      await page.route(url => url.pathname === collection.path && url.searchParams.get('page') === '1', route => route.fulfill({ json: {
        data: Array.from({ length: collection.size }, (_, index) => ({ ...collection.record, id: collection.record.id + index })),
        meta: { page: 1, per_page: collection.size, total: collection.size + 1 },
      } }));
      await page.goto(collection.url);
      const region = page.getByRole('region', { name: collection.region, exact: true });
      await expect(region.getByRole('article')).toHaveCount(collection.size);
      const next = region.getByRole('button', { name: 'Next', exact: true });
      await next.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => scrollY)).toBeGreaterThan(300);
      if (input === 'keyboard') { await next.focus(); await page.keyboard.press('Enter'); }
      else await next.click();
      await expect(region.getByRole('heading', { name: collection.name, exact: true })).toBeVisible();
      await expect(region.getByRole('article').first()).toBeInViewport();
      if (input === 'keyboard') await expect(region).toBeFocused();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: test.info().outputPath('paginated-results.png') });
    });
  }
}
