import type { Page } from '@playwright/test';
import type { Character, Comic, Story } from '../../resources/js/types/catalog';

const spiderMan: Character = {
  id: 1, name: 'Spider-Man', description: 'A character fixture for browser tests.',
  modified_at: null, image_url: null,
};
const ironMan: Character = { ...spiderMan, id: 2, name: 'Iron Man' };
const story: Story = {
  id: 101, title: 'Origin of a hero', type: 'story', modified_at: null,
  counts: { creators: 1, characters: 1, comics: 2, events: 0 },
};
const comic: Comic = {
  id: 1001, digital_id: null, title: 'Amazing Spider-Man #1', description: null,
  format: 'Comic', modified_at: null, on_sale_at: null, digital_price: null, image_url: null,
};

export async function mockCatalog(page: Page) {
  const failures = new Map<string, number>();
  const requests: URL[] = [];
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url());
    requests.push(url);
    const remaining = failures.get(url.pathname) ?? 0;
    if (remaining > 0) {
      failures.set(url.pathname, remaining - 1);
      await route.fulfill({
        status: 503, contentType: 'application/problem+json',
        json: { code: 'upstream-unavailable', detail: 'Catalog temporarily unavailable.' },
      });
      return;
    }
    const currentPage = Number(url.searchParams.get('page') ?? 1);
    const perPage = Number(url.searchParams.get('per_page') ?? 20);
    let data: unknown;
    let total: number;
    if (url.pathname === '/api/v1/characters') {
      const query = url.searchParams.get('query')?.toLowerCase();
      const filtered = [spiderMan, ironMan].filter(item => !query || item.name.toLowerCase().startsWith(query));
      data = query || currentPage === 1 ? filtered : [{ ...spiderMan, id: 3, name: 'Thor' }];
      total = query ? filtered.length : 40;
    } else if (/^\/api\/v1\/characters\/\d+$/.test(url.pathname)) {
      await route.fulfill({ json: { data: url.pathname.endsWith('/2') ? ironMan : spiderMan } });
      return;
    } else if (/^\/api\/v1\/characters\/\d+\/stories$/.test(url.pathname)) {
      data = currentPage === 1 ? [story] : [{ ...story, id: 102, title: 'Next adventure' }];
      total = 11;
    } else if (/^\/api\/v1\/stories\/\d+\/comics$/.test(url.pathname)) {
      data = currentPage === 1 ? [comic] : [{ ...comic, id: 1002, title: 'Amazing Spider-Man #2' }];
      total = 21;
    } else {
      await route.fulfill({ status: 404, json: {} });
      return;
    }
    await route.fulfill({ json: { data, meta: { page: currentPage, per_page: perPage, total } } });
  });
  return { failures, requests };
}
