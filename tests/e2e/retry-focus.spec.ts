import { expect, test, type Page } from '@playwright/test';
import { mockCatalog } from './catalog-fixture';

const scenarios = [
  { url: '/stories/101/comics', resource: '/api/v1/stories/101/comics', button: 'Try comics again', region: 'Comic results', result: 'Amazing Spider-Man #1' },
  { url: '/', resource: '/api/v1/characters', button: 'Try characters again', region: 'Character results', result: 'Spider-Man' },
  { url: '/characters/1', resource: '/api/v1/characters/1/stories', button: 'Try stories again', region: 'Related stories', result: 'Origin of a hero' },
  { url: '/characters/1', resource: '/api/v1/characters/1', button: 'Try character again', region: 'Character details', result: 'Spider-Man' },
];

async function holdResponse(page: Page, resource: string) {
  let release = () => {};
  const heldResponse = new Promise<void>(resolve => { release = resolve; });
  await page.route(url => url.pathname === resource, async route => {
    await heldResponse;
    await route.fallback();
  });
  return release;
}

for (const scenario of scenarios) {
  test(`keeps keyboard focus in ${scenario.region} during and after retry`, async ({ page }) => {
    const { failures } = await mockCatalog(page);
    failures.set(scenario.resource, 1);
    await page.goto(scenario.url);
    const retry = page.getByRole('button', { name: scenario.button, exact: true });
    await expect(retry).toBeVisible();
    const release = await holdResponse(page, scenario.resource);

    await retry.focus();
    await page.keyboard.press('Enter');
    try {
      await expect(page.getByRole('status')).toBeVisible();
      await expect(page.getByRole('region', { name: scenario.region, exact: true })).toBeFocused();
    } finally {
      release();
    }
    await expect(page.getByRole('heading', { name: scenario.result, exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: scenario.region, exact: true })).toBeFocused();
  });

  test(`keeps ${scenario.region} reachable after a repeated failure`, async ({ page }) => {
    const { failures } = await mockCatalog(page);
    failures.set(scenario.resource, 2);
    await page.goto(scenario.url);
    const retry = page.getByRole('button', { name: scenario.button, exact: true });
    await expect(retry).toBeVisible();
    await retry.focus();
    await page.keyboard.press('Enter');
    await expect(retry).toBeVisible();
    await expect(page.getByRole('region', { name: scenario.region, exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(retry).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.getByRole('heading', { name: scenario.result, exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: scenario.region, exact: true })).toBeFocused();
  });
}

test('does not reclaim focus when the visitor leaves the results during retry', async ({ page }) => {
  const { failures } = await mockCatalog(page);
  failures.set('/api/v1/stories/101/comics', 1);
  await page.goto('/stories/101/comics');
  const retry = page.getByRole('button', { name: 'Try comics again', exact: true });
  await expect(retry).toBeVisible();
  const release = await holdResponse(page, '/api/v1/stories/101/comics');
  await retry.focus();
  await page.keyboard.press('Enter');
  const backLink = page.getByRole('link', { name: 'Back to characters', exact: true });
  try {
    await expect(page.getByRole('status')).toBeVisible();
    await backLink.focus();
  } finally {
    release();
  }
  await expect(page.getByRole('heading', { name: 'Amazing Spider-Man #1', exact: true })).toBeVisible();
  await expect(backLink).toBeFocused();
});
