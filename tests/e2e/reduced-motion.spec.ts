import { expect, test } from '@playwright/test';
import { mockCatalog } from './catalog-fixture';

test('respects reduced motion without disabling character navigation', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { characterImages, requests } = await mockCatalog(page);
  const portrait = 'https://images.example.test/motion-portrait.png';
  characterImages.set(1, portrait);
  await page.route(portrait, route => route.fulfill({
    contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'),
  }));

  await page.goto('/');
  const card = page.getByRole('link', { name: 'Spider-Man', exact: true });
  const image = card.getByRole('img');
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  const documentBounds = () => card.evaluate(element => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x: x + window.scrollX, y: y + window.scrollY, width, height };
  });
  const originalBounds = await documentBounds();
  await card.hover();
  await expect(image).toHaveCSS('transform', 'none');
  await expect(image).toHaveCSS('transition-duration', '0s');
  expect(await documentBounds()).toEqual(originalBounds);
  expect(requests).toHaveLength(1);
  await page.screenshot({ path: testInfo.outputPath('reduced-motion-catalog.png'), fullPage: true });

  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(image).toHaveCSS('transition-duration', '0.25s');
  await expect(image).toHaveCSS('transform', 'matrix(1.03, 0, 0, 1.03, 0, 0)');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(image).toHaveCSS('transform', 'none');
  await expect(image).toHaveCSS('transition-duration', '0s');
  expect(await documentBounds()).toEqual(originalBounds);
  expect(requests).toHaveLength(1);

  await image.click();
  await expect(page.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
  expect(requests).toHaveLength(3);
});
