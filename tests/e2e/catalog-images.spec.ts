import { expect, test, type Page } from '@playwright/test';
import { mockCatalog } from './catalog-fixture';

const brokenImage = 'https://images.example.test/unavailable.png';
const validImage = 'https://images.example.test/portrait.png';

async function mockPortrait(page: Page) {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 96;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('A canvas context is required for the image fixture.');
    context.fillStyle = '#e62429';
    context.fillRect(0, 0, 64, 96);
    context.fillStyle = '#ffffff';
    context.fillRect(16, 24, 32, 48);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.route(validImage, route => route.fulfill({
    contentType: 'image/png', body: Buffer.from(base64, 'base64'),
  }));
}

const surfaces = [
  { name: 'character card', url: '/', region: 'Character results', alt: 'Spider-Man', fallback: 'S', calls: 1 },
  { name: 'character portrait', url: '/characters/1', region: 'Character details', alt: 'Spider-Man', fallback: 'S', calls: 2 },
  { name: 'comic cover', url: '/stories/101/comics', region: 'Comic results', alt: 'Amazing Spider-Man #1', fallback: 'MH', calls: 1 },
];

test('keeps character cards usable when their image returns 404', async ({ page }) => {
  const { characterImages, requests } = await mockCatalog(page);
  characterImages.set(1, brokenImage);
  await page.route(brokenImage, route => route.fulfill({ status: 404, body: '' }));

  await page.goto('/');
  const thumbnail = page.getByRole('link', { name: 'View Spider-Man', exact: true });
  await expect(thumbnail.getByText('S', { exact: true })).toBeVisible();
  await expect(thumbnail.getByRole('img')).toHaveCount(0);
  expect(requests).toHaveLength(1);

  await thumbnail.click();
  await expect(page.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
});

for (const surface of surfaces) {
  test(`replaces an unreachable ${surface.name} without layout shifts or catalog retries`, async ({ page }, testInfo) => {
    const { characterImages, comicImages, requests } = await mockCatalog(page);
    characterImages.set(1, brokenImage);
    comicImages.set(1001, brokenImage);
    let imageRequests = 0;
    let release = () => {};
    const pendingImage = new Promise<void>(resolve => { release = resolve; });
    await page.route(brokenImage, async route => {
      imageRequests++;
      await pendingImage;
      await route.abort('failed');
    });

    const image = page.getByRole('img', { name: surface.alt, exact: true });
    let imageSize: { width: number; height: number };
    try {
      await page.goto(surface.url, { waitUntil: 'domcontentloaded' });
      await image.scrollIntoViewIfNeeded();
      imageSize = await image.evaluate(element => ({
        width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height,
      }));
      expect(imageSize.width).toBeGreaterThan(0);
      expect(imageSize.height).toBeGreaterThan(0);
    } finally {
      release();
    }

    const fallback = page.getByRole('region', { name: surface.region, exact: true }).getByText(surface.fallback, { exact: true });
    await expect(fallback).toBeVisible();
    const fallbackSize = await fallback.evaluate(element => ({
      width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height,
    }));
    expect(fallbackSize.width).toBeCloseTo(imageSize.width, 1);
    expect(fallbackSize.height).toBeCloseTo(imageSize.height, 1);
    await expect(page.getByRole('img', { name: surface.alt, exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: surface.alt, exact: true })).toBeVisible();
    expect(imageRequests).toBe(1);
    expect(requests).toHaveLength(surface.calls);
    await expect(page.getByRole('alert')).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath('catalog-fallback.png'), fullPage: true });
  });

  test(`renders a valid ${surface.name} with its alternative text`, async ({ page }, testInfo) => {
    const { characterImages, comicImages } = await mockCatalog(page);
    characterImages.set(1, validImage);
    comicImages.set(1001, validImage);
    await mockPortrait(page);

    await page.goto(surface.url);
    const image = page.getByRole('img', { name: surface.alt, exact: true });
    await image.scrollIntoViewIfNeeded();
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((element: HTMLImageElement) => ({
      width: element.naturalWidth, height: element.naturalHeight,
    }))).toEqual({ width: 64, height: 96 });
    await expect(image).toHaveAttribute('loading', surface.url === '/characters/1' ? 'eager' : 'lazy');
    await expect(page.getByRole('region', { name: surface.region, exact: true }).getByText(surface.fallback, { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath('catalog-image.png'), fullPage: true });
  });

  test(`shows the fallback for a missing ${surface.name} without requesting an image`, async ({ page }) => {
    await mockCatalog(page);
    const imageRequests: string[] = [];
    page.on('request', request => {
      if (request.resourceType() === 'image') imageRequests.push(request.url());
    });
    await page.goto(surface.url);
    await expect(page.getByRole('region', { name: surface.region, exact: true }).getByText(surface.fallback, { exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: surface.alt, exact: true })).toHaveCount(0);
    expect(imageRequests).toHaveLength(0);
  });
}

test('loads a new image URL after a failed image on the same character card', async ({ page }) => {
  const { characterImages, requests } = await mockCatalog(page);
  characterImages.set(1, brokenImage);
  await page.route(brokenImage, route => route.fulfill({ status: 404, body: '' }));
  await mockPortrait(page);
  await page.goto('/');
  const thumbnail = page.getByRole('link', { name: 'View Spider-Man', exact: true });
  await expect(thumbnail.getByText('S', { exact: true })).toBeVisible();

  characterImages.set(1, validImage);
  await page.getByRole('searchbox', { name: 'Search characters' }).fill('sp');
  const image = thumbnail.getByRole('img', { name: 'Spider-Man', exact: true });
  await expect(image).toHaveAttribute('src', validImage);
  await expect.poll(() => image.evaluate((element: HTMLImageElement) => element.naturalWidth)).toBe(64);
  await expect(thumbnail.getByText('S', { exact: true })).toHaveCount(0);
  expect(requests).toHaveLength(2);
});
