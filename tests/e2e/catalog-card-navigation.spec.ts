import { expect, test } from '@playwright/test';
import { mockCatalog } from './catalog-fixture';

test('offers one keyboard stop for each character card', async ({ page }, testInfo) => {
  await mockCatalog(page);
  await page.goto('/?source=portfolio');
  const results = page.getByRole('region', { name: 'Character results', exact: true });
  const spiderMan = results.getByRole('link', { name: 'Spider-Man', exact: true });
  const ironMan = results.getByRole('link', { name: 'Iron Man', exact: true });
  await expect(results.getByRole('link')).toHaveCount(2);
  await expect(spiderMan.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Apply search', exact: true }).focus();
  await page.keyboard.press('Tab');
  await expect(spiderMan).toBeFocused();
  await expect(spiderMan).toHaveCSS('outline-style', 'solid');
  await page.screenshot({ path: testInfo.outputPath('catalog-card-focus.png') });
  await page.keyboard.press('Tab');
  await expect(ironMan).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/characters\/2\?source=portfolio$/);
  await expect(page.getByRole('heading', { name: 'Iron Man', level: 1, exact: true })).toBeVisible();
});
