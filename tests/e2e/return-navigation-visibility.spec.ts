import { expect, test } from '@playwright/test';
import { mockCatalog } from './catalog-fixture';

for (const context of ['', '?character=1']) {
  test(`comic return navigation remains painted above the full-width section: ${context || 'direct link'}`, async ({ page }) => {
    await mockCatalog(page);
    await page.goto(`/stories/101/comics${context}`);
    await expect(page.getByRole('heading', { name: 'Amazing Spider-Man #1', exact: true })).toBeVisible();
    const navigation = page.getByRole('navigation', { name: 'Return navigation', exact: true });
    const screenshot = await navigation.screenshot({ path: test.info().outputPath('return-navigation.png') });
    const visibleLinkPixels = await page.evaluate(async base64 => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('A canvas context is required for the visibility check.');
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        if (pixels[index] > 180 && pixels[index + 1] < 100 && pixels[index + 2] < 100) count++;
      }
      return count;
    }, screenshot.toString('base64'));
    expect(visibleLinkPixels).toBeGreaterThan(20);
    await navigation.getByRole('link', { name: 'Back to characters', exact: true }).click();
    await expect(page).toHaveURL(/\/$/);
  });
}
