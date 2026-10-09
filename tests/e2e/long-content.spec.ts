import { expect, test } from '@playwright/test';
import { mockCatalog } from './catalog-fixture';

const longLabel = 'Marvel'.repeat(30);
const surfaces = [
  { name: 'search', url: `/?query=${'a'.repeat(100)}`, heading: `Results for "${'a'.repeat(100)}"` },
  { name: 'character', url: '/characters/1', heading: longLabel },
  { name: 'comics', url: '/stories/101/comics', heading: longLabel },
];

for (const surface of surfaces) {
  test(`keeps long ${surface.name} content inside the viewport`, async ({ page }, testInfo) => {
    await mockCatalog(page);
    await page.route(url => url.pathname === '/api/v1/characters/1', route => route.fulfill({ json: { data: {
      id: 1, name: longLabel, description: longLabel.repeat(3), modified_at: null, image_url: null,
    } } }));
    await page.route(url => url.pathname === '/api/v1/characters/1/stories', route => route.fulfill({ json: {
      data: [{ id: 101, title: longLabel, type: longLabel, modified_at: null, counts: { comics: 2 } }],
      meta: { page: 1, per_page: 10, total: 1 },
    } }));
    await page.route(url => url.pathname === '/api/v1/stories/101/comics', route => route.fulfill({ json: {
      data: [{ id: 1001, title: longLabel, description: longLabel.repeat(2), format: longLabel,
        modified_at: null, on_sale_at: null, digital_price: null, image_url: null }],
      meta: { page: 1, per_page: 20, total: 1 },
    } }));
    await page.goto(surface.url);
    await expect(page.getByRole('heading', { name: surface.heading, level: surface.name === 'comics' ? 2 : 1, exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
    if (surface.name === 'search') {
      await expect(page.getByRole('searchbox', { name: 'Search characters' })).toHaveCSS('color', 'rgb(17, 24, 39)');
    }
    const headings = page.getByRole('main').getByRole('heading');
    for (const heading of await headings.all()) {
      expect(await heading.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    }
    await page.screenshot({ path: testInfo.outputPath('long-content.png'), fullPage: true });
  });
}
