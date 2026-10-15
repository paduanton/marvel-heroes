import AxeBuilder from '@axe-core/playwright';
import { writeFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mockCatalog } from './catalog-fixture';

async function audit(page: Page, testInfo: TestInfo) {
  const results = await new AxeBuilder({ page }).analyze();
  const summarize = (items: typeof results.violations) => items.map(item => ({
    rule: item.id, impact: item.impact, help: item.help, helpUrl: item.helpUrl,
    nodes: item.nodes.map(node => ({ target: node.target, failure: node.failureSummary })),
  }));
  const report = { engine: results.testEngine, violations: summarize(results.violations), incomplete: summarize(results.incomplete) };
  const path = testInfo.outputPath('accessibility.json');
  await writeFile(path, JSON.stringify(report, null, 2));
  await testInfo.attach('accessibility.json', { path, contentType: 'application/json' });
  expect(report.violations).toEqual([]);
}

const resources = [
  { url: '/', path: '/api/v1/characters', region: 'Character results', heading: 'Spider-Man', empty: 'No characters match this search yet.', perPage: 20 },
  { url: '/characters/1', path: '/api/v1/characters/1', region: 'Character details', heading: 'Spider-Man', empty: null, perPage: 20 },
  { url: '/characters/1', path: '/api/v1/characters/1/stories', region: 'Related stories', heading: 'Origin of a hero', empty: 'No related stories are available for this character.', perPage: 10 },
  { url: '/stories/101/comics', path: '/api/v1/stories/101/comics', region: 'Comic results', heading: 'Amazing Spider-Man #1', empty: 'No comics are available for this story.', perPage: 20 },
];

for (const resource of resources) {
  test(`${resource.region} success has no automatically detected accessibility violations`, async ({ page }, testInfo) => {
    await mockCatalog(page);
    await page.goto(resource.url);
    const region = page.getByRole('region', { name: resource.region, exact: true });
    await expect(region.getByRole('heading', { name: resource.heading, exact: true })).toBeVisible();
    if (resource.url === '/characters/1') {
      await expect(page.getByRole('region', { name: 'Character details', exact: true })).toHaveAttribute('aria-busy', 'false');
      await expect(page.getByRole('region', { name: 'Related stories', exact: true })).toHaveAttribute('aria-busy', 'false');
    }
    await audit(page, testInfo);
  });

  for (const state of ['empty', 'error', 'stale']) {
    if (state === 'empty' && resource.empty === null) continue;
    test(`${resource.region} ${state} has no automatically detected accessibility violations`, async ({ page }, testInfo) => {
      const { cacheStates } = await mockCatalog(page);
      if (state === 'stale') cacheStates.set(resource.path, 'stale');
      else await page.route(url => url.pathname === resource.path, route => state === 'empty'
        ? route.fulfill({ json: { data: [], meta: { page: 1, per_page: resource.perPage, total: 0 } } })
        : route.fulfill({ status: 404, contentType: 'application/problem+json', json: { code: 'resource-not-found' } }));
      await page.goto(resource.url);
      const region = page.getByRole('region', { name: resource.region, exact: true });
      if (state === 'error') await expect(region.getByRole('alert')).toBeVisible();
      else if (state === 'empty') await expect(region.getByRole('status')).toHaveText(resource.empty!);
      else await expect(region.getByRole('status')).toHaveText('Showing cached data. This information may be out of date.');
      await audit(page, testInfo);
    });
  }

  test(`${resource.region} loading has no automatically detected accessibility violations`, async ({ page }, testInfo) => {
    await mockCatalog(page);
    let release = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route(url => url.pathname === resource.path, async route => { await gate; await route.fallback(); });
    const region = page.getByRole('region', { name: resource.region, exact: true });
    try {
      await page.goto(resource.url);
      await expect(region.getByRole('status')).toHaveText('Loading catalog data...');
      await audit(page, testInfo);
      await expect(region).toHaveAttribute('aria-busy', 'true');
    } finally { release(); }
    await expect(region.getByRole('heading', { name: resource.heading, exact: true })).toBeVisible();
  });
}

const identity = { id: 1, name: 'Accessibility Visitor', email: 'accessibility@example.test' };

for (const screen of [
  { url: '/login', title: 'Sign in', authenticated: false },
  { url: '/register', title: 'Create account', authenticated: false },
  { url: '/account', title: 'Your account', authenticated: true },
]) {
  test(`${screen.title} has no automatically detected accessibility violations`, async ({ page }, testInfo) => {
    await page.route('**/api/v1/me', route => route.fulfill(screen.authenticated ? { json: { data: identity } } : { status: 401, json: { code: 'unauthenticated' } }));
    await page.goto(screen.url);
    if (screen.authenticated) await expect(page.getByText(identity.email, { exact: true })).toBeVisible();
    else await expect(page.getByRole('button', { name: screen.title, exact: true })).toBeVisible();
    await audit(page, testInfo);
  });
}

test('registration field errors have no automatically detected accessibility violations', async ({ page }, testInfo) => {
  await page.route('**/api/v1/me', route => route.fulfill({ status: 401, json: { code: 'unauthenticated' } }));
  await page.goto('/register');
  await page.getByLabel('Name', { exact: true }).fill(identity.name);
  await page.getByLabel('Email', { exact: true }).fill(identity.email);
  await page.getByLabel('Password', { exact: true }).fill('valid-test-passphrase');
  await page.getByLabel('Confirm password', { exact: true }).fill('another-test-passphrase');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page.getByText('Enter the same password in both fields.', { exact: true })).toBeVisible();
  await audit(page, testInfo);
});

test('account dependency failure has no automatically detected accessibility violations', async ({ page }, testInfo) => {
  await page.route('**/api/v1/me', route => route.fulfill({ status: 503, json: { code: 'identity-unavailable' } }));
  await page.goto('/account');
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page.getByRole('button', { name: 'Try again', exact: true })).toBeVisible();
  await audit(page, testInfo);
});

test('pending registration has no automatically detected accessibility violations', async ({ page }, testInfo) => {
  let signedIn = false;
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/me', route => route.fulfill(signedIn ? { json: { data: identity } } : { status: 401, json: { code: 'unauthenticated' } }));
  await page.route('**/sanctum/csrf-cookie', route => route.fulfill({ status: 204 }));
  await page.route('**/api/v1/auth/register', async route => {
    await gate;
    signedIn = true;
    await route.fulfill({ status: 201, json: { data: identity } });
  });
  try {
    await page.goto('/register');
    await page.getByLabel('Name', { exact: true }).fill(identity.name);
    await page.getByLabel('Email', { exact: true }).fill(identity.email);
    await page.getByLabel('Password', { exact: true }).fill('valid-test-passphrase');
    await page.getByLabel('Confirm password', { exact: true }).fill('valid-test-passphrase');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Please wait...', exact: true })).toBeDisabled();
    await audit(page, testInfo);
    await expect(page.getByRole('button', { name: 'Please wait...', exact: true })).toBeDisabled();
  } finally { release(); }
  await expect(page).toHaveURL(/\/account$/);
});
