import { expect, test } from '@playwright/test';
import { mockCatalog } from './catalog-fixture';

for (const url of ['/', '/characters/1', '/stories/101/comics']) {
  test(`skips the repeated header with the keyboard on ${url}`, async ({ page }, testInfo) => {
    await mockCatalog(page);
    await page.goto(url);
    await expect(page.getByRole('main')).toBeVisible();

    await page.keyboard.press('Tab');
    const skipLink = page.getByRole('link', { name: 'Skip to main content', exact: true });
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeInViewport({ ratio: 1 });
    await page.screenshot({ path: testInfo.outputPath('skip-link.png') });

    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
    await page.keyboard.press('Tab');
    const firstControl = url === '/'
      ? page.getByRole('searchbox', { name: 'Search characters' })
      : page.getByRole('link', { name: 'Back to characters', exact: true });
    await expect(firstControl).toBeFocused();
  });
}

test('restarts keyboard navigation after page changes and browser history navigation', async ({ page }) => {
  await mockCatalog(page);
  await page.goto('/');
  const destinations = [
    { link: 'Spider-Man', url: /\/characters\/1$/, heading: 'Spider-Man' },
    { link: 'View comics', url: /\/stories\/101\/comics\?character=1$/, heading: 'Related comics' },
    { link: 'Characters', url: /\/$/, heading: 'Discover Marvel characters' },
  ];
  const skipLink = page.getByRole('link', { name: 'Skip to main content', exact: true });

  for (const destination of destinations) {
    const link = page.getByRole('link', { name: destination.link, exact: true });
    await link.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(destination.url);
    await expect(page.getByRole('heading', { name: destination.heading, exact: true })).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(skipLink).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
  }

  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Related comics', exact: true })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(skipLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();

  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Discover Marvel characters', exact: true })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(skipLink).toBeFocused();
});

test('keeps search focused when filters and their browser history change', async ({ page }) => {
  await mockCatalog(page);
  await page.goto('/?page=2');
  const search = page.getByRole('searchbox', { name: 'Search characters' });
  await search.fill('sp');
  await expect(page).toHaveURL(/\?query=sp$/);
  await expect(page.getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
  await expect(search).toBeFocused();

  await page.keyboard.type('ider');
  await expect(page).toHaveURL(/\?query=spider$/);
  await expect(search).toBeFocused();
  await page.goBack();
  await expect(search).toHaveValue('sp');
  await expect(search).toBeFocused();
  await page.goForward();
  await expect(search).toHaveValue('spider');
  await expect(search).toBeFocused();

  await search.fill('');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: 'Iron Man', exact: true })).toBeVisible();
  await expect(search).toBeFocused();
});
