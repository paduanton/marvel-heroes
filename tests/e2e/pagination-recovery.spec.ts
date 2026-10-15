import { expect, test } from '@playwright/test';
import { mockCatalog } from './catalog-fixture';

const scenarios = [
  { url: '/?source=demo', resource: '/api/v1/characters', region: 'Character results', result: 'Spider-Man', perPage: 20, empty: 'No characters match this search yet.' },
  { url: '/characters/1', resource: '/api/v1/characters/1/stories', region: 'Related stories', result: 'Origin of a hero', perPage: 10, empty: 'No related stories are available for this character.' },
  { url: '/stories/101/comics', resource: '/api/v1/stories/101/comics', region: 'Comic results', result: 'Amazing Spider-Man #1', perPage: 20, empty: 'No comics are available for this story.' },
];

for (const scenario of scenarios) {
  test(`recovers ${scenario.region} when a later page becomes empty`, async ({ page }, testInfo) => {
    const { requests } = await mockCatalog(page);
    await page.route(url => url.pathname === scenario.resource && url.searchParams.get('page') === '2', route => route.fulfill({ json: {
      data: [], meta: { page: 2, per_page: scenario.perPage, total: 0 },
    } }));
    await page.goto(scenario.url);
    const region = page.getByRole('region', { name: scenario.region, exact: true });
    await expect(region.getByRole('heading', { name: scenario.result, exact: true })).toBeVisible();
    await region.getByRole('button', { name: 'Next', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(region.getByText(scenario.empty, { exact: true })).toBeVisible();
    await expect(region).toBeFocused();
    await expect(region.getByRole('button', { name: 'Previous', exact: true })).toBeEnabled();
    await expect(region.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
    await region.getByRole('button', { name: 'First page', exact: true }).focus();
    await page.keyboard.press('Space');
    await expect(region.getByRole('heading', { name: scenario.result, exact: true })).toBeVisible();
    await expect(region.getByText('Page 1', { exact: true })).toBeVisible();
    await expect(region.getByRole('button', { name: 'First page', exact: true })).toBeDisabled();
    await expect(region).toBeFocused();
    expect(requests.filter(url => url.pathname === scenario.resource && url.searchParams.get('page') === '1')).toHaveLength(2);
    if (scenario.region === 'Character results') expect(new URL(page.url()).searchParams.get('source')).toBe('demo');
    if (scenario.region === 'Related stories') expect(requests.filter(url => url.pathname === '/api/v1/characters/1')).toHaveLength(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('pagination-recovery.png'), fullPage: true });
  });
}

test('returns directly from an empty deep-linked catalog page without losing its filter', async ({ page }) => {
  const { requests } = await mockCatalog(page);
  await page.route(url => url.pathname === '/api/v1/characters' && url.searchParams.get('page') !== '1', route => route.fulfill({ json: {
    data: [], meta: { page: 9007199254740991, per_page: 20, total: 1 },
  } }));
  await page.goto('/?query=sp&page=9007199254740991&source=demo');
  const region = page.getByRole('region', { name: 'Character results' });
  await expect(region.getByText('No characters match this search yet.', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await region.getByRole('button', { name: 'First page', exact: true }).click();
  await expect(region.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('query')).toBe('sp');
  expect(new URL(page.url()).searchParams.has('page')).toBe(false);
  expect(new URL(page.url()).searchParams.get('source')).toBe('demo');
  expect(requests).toHaveLength(1);
});
