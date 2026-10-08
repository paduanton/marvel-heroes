import { expect, test, type Page } from '@playwright/test';
import { mockCatalog } from './catalog-fixture';

const scenarios = [
  { url: '/', resource: '/api/v1/characters', region: 'Character results', first: 'Spider-Man', second: 'Thor', perPage: 20, retry: 'Try characters again' },
  { url: '/characters/1', resource: '/api/v1/characters/1/stories', region: 'Related stories', first: 'Origin of a hero', second: 'Next adventure', perPage: 10, retry: 'Try stories again' },
  { url: '/stories/101/comics', resource: '/api/v1/stories/101/comics', region: 'Comic results', first: 'Amazing Spider-Man #1', second: 'Amazing Spider-Man #2', perPage: 20, retry: 'Try comics again' },
];

async function holdSecondPage(page: Page, resource: string) {
  let release = () => {};
  const response = new Promise<void>(resolve => { release = resolve; });
  await page.route(url => url.pathname === resource && url.searchParams.get('page') === '2', async route => {
    await response;
    await route.fallback();
  });
  return release;
}

for (const scenario of scenarios) {
  test(`keeps ${scenario.region} focused while paging forward and back`, async ({ page }) => {
    const { requests } = await mockCatalog(page);
    await page.goto(scenario.url);
    const region = page.getByRole('region', { name: scenario.region, exact: true });
    await expect(region.getByRole('heading', { name: scenario.first, exact: true })).toBeVisible();
    const release = await holdSecondPage(page, scenario.resource);
    await region.getByRole('button', { name: 'Next', exact: true }).focus();
    await page.keyboard.press('Enter');
    try {
      await expect(region.getByRole('status')).toBeVisible();
      await expect(region).toBeFocused();
    } finally {
      release();
    }
    await expect(region.getByRole('heading', { name: scenario.second, exact: true })).toBeVisible();
    await expect(region).toBeFocused();
    await expect(region.getByRole('button', { name: 'Next', exact: true })).toBeDisabled();
    const secondPage = requests.filter(url => url.pathname === scenario.resource && url.searchParams.get('page') === '2');
    expect(secondPage).toHaveLength(1);
    expect(secondPage[0].searchParams.get('per_page')).toBe(String(scenario.perPage));

    await region.getByRole('button', { name: 'Previous', exact: true }).focus();
    await page.keyboard.press('Space');
    await expect(region.getByRole('heading', { name: scenario.first, exact: true })).toBeVisible();
    await expect(region).toBeFocused();
    await expect(region.getByRole('button', { name: 'Previous', exact: true })).toBeDisabled();
    if (scenario.region === 'Related stories') {
      expect(requests.filter(url => url.pathname === '/api/v1/characters/1')).toHaveLength(1);
    }
  });

  test(`keeps ${scenario.region} reachable after a page failure and retry`, async ({ page }) => {
    const { failures, requests } = await mockCatalog(page);
    await page.goto(scenario.url);
    const region = page.getByRole('region', { name: scenario.region, exact: true });
    await expect(region.getByRole('heading', { name: scenario.first, exact: true })).toBeVisible();
    failures.set(scenario.resource, 1);
    await region.getByRole('button', { name: 'Next', exact: true }).focus();
    await page.keyboard.press('Enter');
    const retry = region.getByRole('button', { name: scenario.retry, exact: true });
    await expect(retry).toBeVisible();
    await expect(region).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(retry).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(region.getByRole('heading', { name: scenario.second, exact: true })).toBeVisible();
    await expect(region).toBeFocused();
    await expect(region.getByText('Page 2', { exact: true })).toBeVisible();
    const attempts = requests.filter(url => url.pathname === scenario.resource && url.searchParams.get('page') === '2');
    expect(attempts).toHaveLength(2);
    expect(attempts.every(url => url.searchParams.get('per_page') === String(scenario.perPage))).toBe(true);
  });

  test(`does not reclaim focus when leaving ${scenario.region} during pagination`, async ({ page }) => {
    await mockCatalog(page);
    await page.goto(scenario.url);
    const region = page.getByRole('region', { name: scenario.region, exact: true });
    await expect(region.getByRole('heading', { name: scenario.first, exact: true })).toBeVisible();
    const release = await holdSecondPage(page, scenario.resource);
    await region.getByRole('button', { name: 'Next', exact: true }).focus();
    await page.keyboard.press('Enter');
    const navigation = page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name: 'Characters', exact: true });
    try {
      await expect(region.getByRole('status')).toBeVisible();
      await expect(region).toBeFocused();
      await navigation.focus();
    } finally {
      release();
    }
    await expect(region.getByRole('heading', { name: scenario.second, exact: true })).toBeVisible();
    await expect(navigation).toBeFocused();
  });
}
