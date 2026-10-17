import { expect, test, type Page } from '@playwright/test';
import { mockCatalog } from './catalog-fixture';
import { audit } from '../Support/accessibility';

async function enlargeText(page: Page) {
  await page.evaluate(() => {
    const elements = [...document.querySelectorAll<HTMLElement>('body *')]
      .filter(element => [...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
        || element.matches('input, button'));
    const sizes = elements.map(element => Number.parseFloat(getComputedStyle(element).fontSize));
    elements.forEach((element, index) => element.style.setProperty('font-size', `${sizes[index] * 2}px`, 'important'));
  });
}

test('keeps header navigation visible and separate with enlarged text', async ({ page }, testInfo) => {
  await mockCatalog(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
  await enlargeText(page);
  await page.screenshot({ path: testInfo.outputPath('enlarged-header.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const brand = await page.getByRole('link', { name: 'Marvel Heroes home', exact: true }).boundingBox();
  const navigation = await page.getByRole('navigation', { name: 'Primary navigation' }).boundingBox();
  expect(brand).not.toBeNull();
  expect(navigation).not.toBeNull();
  expect(brand!.x + brand!.width <= navigation!.x || brand!.y + brand!.height <= navigation!.y).toBe(true);
  for (const name of ['Characters', 'Account']) {
    const link = page.getByRole('navigation', { name: 'Primary navigation' }).getByRole('link', { name, exact: true });
    await expect(link).toBeInViewport({ ratio: 1 });
    await link.focus();
    await expect(link).toBeFocused();
  }
});

const surfaces = [
  { name: 'characters', url: '/', heading: 'Discover Marvel characters' },
  { name: 'character details', url: '/characters/1', heading: 'Spider-Man' },
  { name: 'comics', url: '/stories/101/comics', heading: 'Related comics' },
  { name: 'login', url: '/login', heading: 'Sign in' },
  { name: 'registration', url: '/register', heading: 'Create account' },
  { name: 'account', url: '/account', heading: 'Your account' },
];

for (const surface of surfaces) {
  for (const preference of ['enlarged text', 'text spacing']) {
    test(`keeps ${surface.name} usable with ${preference}`, async ({ page }, testInfo) => {
      await mockCatalog(page);
      await page.route('**/api/v1/me', route => route.fulfill(surface.name === 'account'
        ? { json: { data: { id: 1, name: 'Reflow Visitor', email: 'reflow@example.test' } } }
        : { status: 401, json: { code: 'unauthenticated' } }));
      await page.goto(surface.url);
      await expect(page.getByRole('heading', { name: surface.heading, level: 1, exact: true })).toBeVisible();
      await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
      if (preference === 'enlarged text') await enlargeText(page);
      else await page.addStyleTag({ content: '* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }' });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const controls = page.getByRole('main').locator('a, button, input').filter({ visible: true });
      for (const control of await controls.all()) {
        const bounds = await control.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.x).toBeGreaterThanOrEqual(0);
        expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
      }
      await page.screenshot({ path: testInfo.outputPath('text-reflow.png'), fullPage: true });
      await audit(page, testInfo, 'text-reflow-accessibility');
    });
  }
}
