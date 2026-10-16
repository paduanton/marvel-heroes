import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('the largest safe source identifier survives JSON and discovery links without rounding', async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ 'X-Marvel-Test-Scenario': randomUUID(), 'X-Marvel-Test-Record-Id': 'safe-limit' });
  await page.route('**/api/v1/**', route => route.continue());
  await page.goto('/');
  const character = page.getByRole('region', { name: 'Character results', exact: true }).getByRole('link', { name: 'Spider-Man', exact: true });
  await expect(character).toHaveAttribute('href', '/characters/9007199254740991');
  await character.click();
  await expect(page.getByRole('region', { name: 'Character details', exact: true }).getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
  const comics = page.getByRole('region', { name: 'Related stories', exact: true }).getByRole('link', { name: 'View comics', exact: true });
  await expect(comics).toHaveAttribute('href', '/stories/9007199254740991/comics?character=9007199254740991');
  await comics.click();
  await expect(page.getByRole('region', { name: 'Comic results', exact: true }).getByRole('heading', { name: 'Spider-Man', exact: true })).toBeVisible();
  const response = await context.request.get('/api/v1/stories/9007199254740991/comics');
  expect(response.status()).toBe(200);
  const record = (await response.json()).data[0];
  expect(record.id).toBe(9007199254740991);
  expect(record.digital_id).toBe(9007199254740991);
  expect(response.headers()['x-test-upstream-calls']).toBe('4');
});

test('an unsafe source identifier is rejected before the browser can create a discovery link', async ({ page, context }) => {
  const headers = { 'X-Marvel-Test-Scenario': randomUUID(), 'X-Marvel-Test-Record-Id': 'unsafe' };
  await context.setExtraHTTPHeaders(headers);
  const failed = page.waitForResponse(response => new URL(response.url()).pathname === '/api/v1/characters');
  await page.goto('/');
  const response = await failed;
  expect(response.status()).toBe(502);
  expect(response.headers().etag).toBeUndefined();
  expect(await response.json()).toMatchObject({ code: 'upstream-unavailable' });
  const region = page.getByRole('region', { name: 'Character results', exact: true });
  await expect(region.getByRole('alert')).toHaveText('Catalog is temporarily unavailable. Please try again later.');
  await expect(region.getByRole('article')).toHaveCount(0);
  await context.setExtraHTTPHeaders({ ...headers, 'X-Marvel-Test-Record-Id': 'safe-limit' });
  await region.getByRole('button', { name: 'Try characters again', exact: true }).click();
  await expect(region.getByRole('link', { name: 'Spider-Man', exact: true })).toHaveAttribute('href', '/characters/9007199254740991');
  await expect(region.getByRole('alert')).toHaveCount(0);
});

test('an unsafe refresh cannot replace a safe cached identifier and later recovery stays navigable', async ({ page, context }) => {
  const headers = { 'X-Marvel-Test-Scenario': randomUUID(), 'X-Marvel-Test-Record-Id': 'safe-limit' };
  await context.setExtraHTTPHeaders(headers);
  expect((await context.request.get('/api/v1/characters')).status()).toBe(200);
  await context.setExtraHTTPHeaders({ ...headers, 'X-Marvel-Test-Record-Id': 'unsafe', 'X-Marvel-Test-Age-Days': '31' });
  await page.route('**/api/v1/**', route => route.continue());
  await page.goto('/');
  const region = page.getByRole('region', { name: 'Character results', exact: true });
  await expect(region.getByRole('status')).toHaveText('Showing cached data. This information may be out of date.');
  await expect(region.getByRole('link', { name: 'Spider-Man', exact: true })).toHaveAttribute('href', '/characters/9007199254740991');
  await context.setExtraHTTPHeaders({ ...headers, 'X-Marvel-Test-Age-Days': '31', 'X-Marvel-Test-Revision': '2' });
  await page.reload();
  await expect(region.getByRole('link', { name: 'Recovered Hero', exact: true })).toHaveAttribute('href', '/characters/9007199254740991');
  await expect(region.getByRole('status')).toHaveCount(0);
  const cached = await context.request.get('/api/v1/characters');
  expect(cached.headers()['x-test-upstream-calls']).toBe('3');
});
