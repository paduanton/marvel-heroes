import { expect, test } from '@playwright/test';
import { mockCatalog } from './catalog-fixture';

test('cancels an unfinished character request when another character is discovered', async ({ page }) => {
  await mockCatalog(page);
  const cancelled: string[] = [];
  page.on('requestfailed', request => cancelled.push(new URL(request.url()).pathname));
  let started = false;
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let settled!: () => void;
  const completed = new Promise<void>(resolve => { settled = resolve; });
  await page.route('**/api/v1/characters/1', async route => {
    started = true;
    try {
      await pending;
      await route.fulfill({ json: { data: {
        id: 1, name: 'Obsolete character', description: null, image_url: null, modified_at: null,
      } } });
    } finally {
      settled();
    }
  });

  try {
    await page.goto('/characters/1', { waitUntil: 'domcontentloaded' });
    await expect.poll(() => started).toBe(true);
    await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Characters', exact: true }).click();
    await page.getByRole('link', { name: 'Iron Man', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Iron Man', exact: true })).toBeVisible();
    await expect.poll(() => cancelled).toContain('/api/v1/characters/1');
  } finally {
    release();
    if (started) await completed;
  }

  await expect(page).toHaveURL(/\/characters\/2$/);
  await expect(page.getByRole('heading', { name: 'Iron Man', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Obsolete character', exact: true })).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

const collections = [
  {
    name: 'stories', url: '/characters/1', pathname: '/api/v1/characters/1/stories',
    region: 'Related stories', firstTitle: 'Origin of a hero', perPage: 10, total: 11,
    obsolete: { id: 102, title: 'Obsolete story', type: 'story', modified_at: null, counts: { comics: 1 } },
  },
  {
    name: 'comics', url: '/stories/101/comics', pathname: '/api/v1/stories/101/comics',
    region: 'Comic results', firstTitle: 'Amazing Spider-Man #1', perPage: 20, total: 21,
    obsolete: {
      id: 1002, title: 'Obsolete comic', description: null, format: 'Comic',
      modified_at: null, on_sale_at: null, digital_price: null, image_url: null,
    },
  },
];

for (const collection of collections) {
  test(`cancels unfinished ${collection.name} pagination when discovery starts again`, async ({ page }) => {
    await mockCatalog(page);
    let cancelled = false;
    page.on('requestfailed', request => {
      const url = new URL(request.url());
      if (url.pathname === collection.pathname && url.searchParams.get('page') === '2') cancelled = true;
    });
    let started = false;
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    let settled!: () => void;
    const completed = new Promise<void>(resolve => { settled = resolve; });
    await page.route(`**${collection.pathname}?**`, async route => {
      if (new URL(route.request().url()).searchParams.get('page') !== '2') {
        await route.fallback();
        return;
      }
      started = true;
      try {
        await pending;
        await route.fulfill({ json: {
          data: [collection.obsolete], meta: { page: 2, per_page: collection.perPage, total: collection.total },
        } });
      } finally {
        settled();
      }
    });

    const results = page.getByRole('region', { name: collection.region, exact: true });
    try {
      await page.goto(collection.url);
      await expect(results.getByRole('heading', { name: collection.firstTitle, exact: true })).toBeVisible();
      await results.getByRole('button', { name: 'Next', exact: true }).click();
      await expect.poll(() => started).toBe(true);
      await page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Characters', exact: true }).click();
      await page.getByRole('link', { name: 'Iron Man', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Iron Man', exact: true })).toBeVisible();
      if (collection.name === 'comics') await page.getByRole('link', { name: 'View comics', exact: true }).click();
      await expect(results.getByRole('heading', { name: collection.firstTitle, exact: true })).toBeVisible();
      await expect.poll(() => cancelled).toBe(true);
    } finally {
      release();
      if (started) await completed;
    }

    await expect(results.getByRole('heading', { name: collection.firstTitle, exact: true })).toBeVisible();
    await expect(results.getByText('Page 1', { exact: true })).toBeVisible();
    await expect(results.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
    await expect(page.getByRole('heading', { name: collection.obsolete.title, exact: true })).toHaveCount(0);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}
