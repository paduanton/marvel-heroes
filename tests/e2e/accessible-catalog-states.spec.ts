import { expect, test } from '@playwright/test';
import { mockCatalog } from './catalog-fixture';

const scenarios = [
  { url: '/', resource: '/api/v1/characters', region: 'Character results', result: 'Spider-Man', empty: 'No characters match this search yet.' },
  { url: '/characters/1', resource: '/api/v1/characters/1', region: 'Character details', result: 'Spider-Man', empty: 'This character is not available.' },
  { url: '/characters/1', resource: '/api/v1/characters/1/stories', region: 'Related stories', result: 'Origin of a hero', empty: 'No related stories are available for this character.' },
  { url: '/stories/101/comics', resource: '/api/v1/stories/101/comics', region: 'Comic results', result: 'Amazing Spider-Man #1', empty: 'No comics are available for this story.' },
];

for (const scenario of scenarios) {
  for (const outcome of ['success', 'empty', 'error']) {
    test(`announces ${scenario.region} loading and ${outcome} independently`, async ({ page }) => {
      await mockCatalog(page);
      let release = () => {};
      const gate = new Promise<void>(resolve => { release = resolve; });
      await page.route(url => url.pathname === scenario.resource, async route => {
        await gate;
        if (outcome === 'success') await route.fallback();
        else if (outcome === 'empty') await route.fulfill({ json: {
          data: scenario.region === 'Character details' ? null : [], meta: { page: 1, per_page: 20, total: 0 },
        } });
        else await route.fulfill({ status: 503, contentType: 'application/problem+json', json: {
          status: 503, code: 'upstream-unavailable', detail: 'The catalog source is temporarily unavailable.',
        } });
      });
      const region = page.getByRole('region', { name: scenario.region, exact: true });
      try {
        await page.goto(scenario.url);
        await expect(region).toHaveAttribute('aria-busy', 'true');
        await expect(region.getByRole('status')).toHaveText('Loading catalog data...');
        await page.getByRole('link', { name: 'Marvel Heroes home', exact: true }).focus();
      } finally {
        release();
      }
      await expect(region).toHaveAttribute('aria-busy', 'false');
      if (outcome === 'success') {
        await expect(region.getByRole('heading', { name: scenario.result, exact: true })).toBeVisible();
        await expect(region.getByRole('status')).toHaveCount(0);
      } else if (outcome === 'empty') {
        await expect(region.getByRole('status')).toHaveText(scenario.empty);
        await expect(region.getByRole('alert')).toHaveCount(0);
      } else {
        await expect(region.getByRole('alert')).toBeVisible();
        await expect(region.getByRole('status')).toHaveCount(0);
      }
      await expect(page.getByRole('link', { name: 'Marvel Heroes home', exact: true })).toBeFocused();
    });
  }
}
