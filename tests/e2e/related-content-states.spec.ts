import { expect, test } from '@playwright/test';
import { mockCatalog } from './catalog-fixture';

const scenarios = [
  {
    name: 'stories', url: '/characters/1', resource: '/api/v1/characters/1/stories',
    region: 'Related stories', heading: 'Spider-Man', result: 'Origin of a hero',
    retry: 'Try stories again', empty: 'No related stories are available for this character.', perPage: 10,
  },
  {
    name: 'comics', url: '/stories/101/comics', resource: '/api/v1/stories/101/comics',
    region: 'Comic results', heading: 'Related comics', result: 'Amazing Spider-Man #1',
    retry: 'Try comics again', empty: 'No comics are available for this story.', perPage: 20,
  },
];

for (const scenario of scenarios) {
  test(`keeps the page visible while related ${scenario.name} are loading`, async ({ page }) => {
    await mockCatalog(page);
    let release = () => {};
    const pendingResponse = new Promise<void>(resolve => { release = resolve; });
    await page.route(url => url.pathname === scenario.resource, async route => {
      await pendingResponse;
      await route.fallback();
    });

    try {
      await page.goto(scenario.url);
      await expect(page.getByRole('heading', { name: scenario.heading, exact: true })).toBeVisible();
      const results = page.getByRole('region', { name: scenario.region, exact: true });
      await expect(results.getByRole('status')).toHaveText('Loading catalog data...');
      await expect(results.getByRole('alert')).toHaveCount(0);
      await expect(results.getByRole('heading', { name: scenario.result, exact: true })).toHaveCount(0);
      await expect(results.getByRole('button', { name: scenario.retry, exact: true })).toHaveCount(0);
      await expect(results.getByRole('navigation', { name: 'Catalog pages' })).toHaveCount(0);
      await expect(results.getByText(scenario.empty, { exact: true })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Back to characters', exact: true })).toBeVisible();
    } finally {
      release();
    }

    const results = page.getByRole('region', { name: scenario.region, exact: true });
    await expect(results.getByRole('heading', { name: scenario.result, exact: true })).toBeVisible();
    await expect(results.getByRole('status')).toHaveCount(0);
    await expect(results.getByRole('navigation', { name: 'Catalog pages' })).toBeVisible();
  });

  test(`renders empty ${scenario.name} without retry and recovers on later navigation`, async ({ page }) => {
    await mockCatalog(page);
    let servedEmpty = false;
    await page.route(url => url.pathname === scenario.resource, async route => {
      if (servedEmpty) {
        await route.fallback();
        return;
      }
      servedEmpty = true;
      await route.fulfill({ json: { data: [], meta: { page: 1, per_page: scenario.perPage, total: 0 } } });
    });

    await page.goto(scenario.url);
    await expect(page.getByRole('heading', { name: scenario.heading, exact: true })).toBeVisible();
    const results = page.getByRole('region', { name: scenario.region, exact: true });
    await expect(results.getByText(scenario.empty, { exact: true })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(results.getByRole('status')).toHaveCount(0);
    await expect(results.getByRole('button', { name: scenario.retry, exact: true })).toHaveCount(0);
    await expect(results.getByRole('navigation', { name: 'Catalog pages' })).toHaveCount(0);

    await page.getByRole('link', { name: 'Back to characters', exact: true }).click();
    const character = scenario.name === 'stories' ? 'Iron Man' : 'Spider-Man';
    await page.getByRole('link', { name: character, exact: true }).click();
    if (scenario.name === 'comics') {
      await page.getByRole('link', { name: 'View comics', exact: true }).click();
    }
    await expect(results.getByRole('heading', { name: scenario.result, exact: true })).toBeVisible();
    await expect(results.getByText(scenario.empty, { exact: true })).toHaveCount(0);
    await expect(results.getByRole('navigation', { name: 'Catalog pages' })).toBeVisible();
  });
}
