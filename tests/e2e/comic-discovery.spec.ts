import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { Comic } from '../../resources/js/types/catalog';

const edition: Comic = {
  id: 3000001570001, title: 'The Amazing Spider-Man (1963) #1', format: 'Comic',
  description: null, digital_id: null, digital_price: null, image_url: null,
  modified_at: null, on_sale_at: '1962-12-10T00:00:00Z',
};

test('searches, pins the local source, and opens an edition', async ({ page }) => {
  await page.route('**/api/v1/comics**', async route => {
    const url = new URL(route.request().url());
    const meta = { source: 'local', cache: { state: 'fresh' } };
    if (url.pathname.endsWith(String(edition.id))) {
      await route.fulfill({ json: { data: edition, meta } });
    } else {
      await route.fulfill({ json: {
        data: [edition],
        meta: { ...meta, page: Number(url.searchParams.get('page') ?? 1), per_page: 20, total: 21 },
      } });
    }
  });
  await page.goto('/comics');
  await page.getByRole('searchbox', { name: 'Search comics' }).fill('Spider-Man');
  await expect(page).toHaveURL(/query=Spider-Man/);
  await expect(page.getByText('Illustrative cover').first()).toBeVisible();
  const pinned = page.waitForRequest(request => {
    const url = new URL(request.url());
    return url.pathname === '/api/v1/comics' && url.searchParams.get('source') === 'local' && url.searchParams.get('page') === '2';
  });
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await pinned;
  await page.getByRole('link', { name: edition.title }).click();
  await expect(page.getByRole('heading', { name: edition.title })).toBeVisible();
  await expect(page.getByText('Local catalog', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole('link', { name: 'Back to comics' }).click();
  await expect(page).toHaveURL(/page=2/);
});

test('restarts at page one of the local catalog when the pinned live source fails', async ({ page }) => {
  await page.route('**/api/v1/comics**', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('source') === 'live') {
      await route.fulfill({ status: 503, contentType: 'application/problem+json', json: { code: 'catalog-source-unavailable' } });
    } else {
      await route.fulfill({ json: { data: [edition], meta: { page: 1, per_page: 20, total: 1, source: 'local', cache: { state: 'fresh' } } } });
    }
  });
  await page.goto('/comics?query=Spider-Man&page=2&source=live');
  await expect(page.getByText('The live catalog is unavailable. You can browse the local catalog.')).toBeVisible();
  await page.getByRole('button', { name: 'Browse local catalog' }).click();
  const current = new URL(page.url());
  expect(current.searchParams.get('page')).toBeNull();
  expect(current.searchParams.get('query')).toBe('Spider-Man');
  expect(current.searchParams.get('source')).toBe('local');
  await expect(page.getByRole('link', { name: edition.title })).toBeVisible();
});

test('credits live comic metadata on the list and detail without showing upstream covers', async ({ page }) => {
  const liveEdition = { ...edition, id: 2000000000021, title: 'Amazing Spider-Man (2024) #5' };
  await page.route('**/api/v1/comics**', async route => {
    const url = new URL(route.request().url());
    const meta = { source: 'live', cache: { state: 'stale' } };
    if (url.pathname.endsWith(String(liveEdition.id))) {
      await route.fulfill({ json: { data: liveEdition, meta } });
    } else {
      await route.fulfill({ json: { data: [liveEdition], meta: { ...meta, page: 1, per_page: 20, total: 1 } } });
    }
  });

  await page.goto('/comics');
  await expect(page.getByRole('link', { name: 'Metron', exact: true })).toHaveAttribute('href', 'https://metron.cloud/');
  await expect(page.getByText('Illustrative cover')).toBeVisible();
  await page.getByRole('link', { name: liveEdition.title }).click();
  await expect(page.getByRole('heading', { name: liveEdition.title })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Metron', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'CC BY-SA 4.0', exact: true })).toBeVisible();
  await expect(page.getByText('Illustrative cover')).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test('pins the related comic source and lets the visitor restart locally after an outage', async ({ page }) => {
  const character = { id: 3000000006122, name: 'Spider-Man', image_url: null, description: null, modified_at: null };
  const meta = { source: 'local', cache: { state: 'fresh' } };
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url());
    const source = url.searchParams.get('source');
    if (url.pathname.endsWith(String(character.id))) {
      await route.fulfill({ json: { data: character, meta } });
    } else if (url.pathname.endsWith('/stories')) {
      await route.fulfill({ json: { data: [], meta: { ...meta, page: 1, per_page: 10, total: 0 } } });
    } else if (url.pathname.endsWith('/comics') && source === 'live') {
      await route.fulfill({ status: 502, contentType: 'application/problem+json', json: { code: 'upstream-unavailable' } });
    } else if (url.pathname.endsWith('/comics')) {
      const local = source === 'local';
      const data = local ? [edition] : [{ ...edition, id: 2000000000021, title: 'Live edition' }];
      await route.fulfill({ json: { data, meta: { ...meta, source: local ? 'local' : 'live', page: 1, per_page: 20, total: local ? 1 : 21 } } });
    } else {
      await route.fallback();
    }
  });

  await page.goto(`/characters/${character.id}?query=spider`);
  const related = page.getByRole('region', { name: 'Related comic editions' });
  await expect(related.getByRole('link', { name: 'Metron', exact: true })).toBeVisible();
  await related.getByRole('button', { name: 'Next', exact: true }).click();
  await expect(page).toHaveURL(/character_comics_source=live/);
  await related.getByRole('button', { name: 'Browse local catalog' }).click();
  await expect(related.getByRole('link', { name: edition.title })).toBeVisible();
  await expect(related.getByRole('link', { name: 'Grand Comics Database' })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('character_comics_page')).toBeNull();
  expect(new URL(page.url()).searchParams.get('character_comics_source')).toBe('local');
  expect(new URL(page.url()).searchParams.get('query')).toBe('spider');
});

test('opens a comic appearance directly from the character and returns to that character', async ({ page }) => {
  const character = { id: 3000000006122, name: 'Spider-Man', image_url: null, description: null, modified_at: null };
  const meta = { source: 'local', cache: { state: 'fresh' } };
  await page.route('**/api/v1/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith(String(character.id))) {
      await route.fulfill({ json: { data: character, meta } });
    } else if (url.pathname.endsWith(String(edition.id))) {
      await route.fulfill({ json: { data: edition, meta } });
    } else {
      const data = url.pathname.endsWith('/comics') ? [edition] : [];
      await route.fulfill({ json: { data, meta: { ...meta, page: 1, per_page: 20, total: data.length } } });
    }
  });
  await page.goto(`/characters/${character.id}?query=spider`);
  await page.getByRole('region', { name: 'Related comic editions' }).getByRole('link', { name: edition.title }).click();
  await page.getByRole('link', { name: 'Back to character' }).click();
  await expect(page).toHaveURL(new RegExp(`/characters/${character.id}\\?query=spider$`));
});
