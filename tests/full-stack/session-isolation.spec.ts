import { randomUUID } from 'node:crypto';
import { expect, test, type APIRequestContext } from '@playwright/test';

const password = 'valid-isolation-test-passphrase';

async function csrf(request: APIRequestContext) {
  expect((await request.get('/sanctum/csrf-cookie')).status()).toBe(204);
  const cookie = (await request.storageState()).cookies.find(item => item.name === 'XSRF-TOKEN');
  expect(cookie).toBeDefined();
  return { 'X-XSRF-TOKEN': decodeURIComponent(cookie!.value) };
}

async function register(request: APIRequestContext, email: string) {
  const response = await request.post('/api/v1/auth/register', {
    headers: await csrf(request),
    data: { name: 'Session visitor', email, password, password_confirmation: password },
  });
  expect(response.status()).toBe(201);
  expect(response.headers()['cache-control']).toBe('no-store, private');
  return (await response.json()).data.id as number;
}

test.beforeEach(() => {
  test.skip(test.info().project.name !== 'desktop', 'Protocol isolation does not depend on viewport size.');
});

test('independent identities share catalog cache but never private responses or logout', async ({ playwright, baseURL }) => {
  const settings = { baseURL, extraHTTPHeaders: { 'X-Marvel-Test-Scenario': randomUUID() } };
  const first = await playwright.request.newContext(settings);
  const second = await playwright.request.newContext(settings);
  try {
    const firstEmail = `${randomUUID()}@example.test`;
    const secondEmail = `${randomUUID()}@example.test`;
    const firstId = await register(first, firstEmail);
    const secondId = await register(second, secondEmail);
    expect(firstId).not.toBe(secondId);

    for (const [client, email, id] of [[first, firstEmail, firstId], [second, secondEmail, secondId]] as const) {
      const me = await client.get('/api/v1/me', { headers: { 'If-None-Match': '*' } });
      expect(me.status()).toBe(200);
      expect(await me.json()).toEqual({ data: { id, name: 'Session visitor', email } });
      expect(me.headers()['cache-control']).toBe('no-store, private');
      expect(me.headers().etag).toBeUndefined();
    }
    const catalog = await first.get('/api/v1/characters');
    expect(catalog.status()).toBe(200);
    expect(catalog.headers()['x-test-upstream-calls']).toBe('1');
    const reused = await second.get('/api/v1/characters', { headers: { 'If-None-Match': catalog.headers().etag } });
    expect(reused.status()).toBe(304);
    expect(reused.headers()['x-test-upstream-calls']).toBe('1');

    expect((await first.post('/api/v1/auth/logout', { headers: await csrf(first) })).status()).toBe(204);
    expect((await first.get('/api/v1/me')).status()).toBe(401);
    expect(await (await second.get('/api/v1/me')).json()).toMatchObject({ data: { id: secondId, email: secondEmail } });
    expect((await first.get('/api/v1/characters')).status()).toBe(200);
  } finally {
    await first.dispose();
    await second.dispose();
  }
});

test('registration rotation and logout prevent replay of captured session cookies', async ({ playwright, baseURL }) => {
  const settings = { baseURL, extraHTTPHeaders: { 'X-Marvel-Test-Scenario': randomUUID() } };
  const client = await playwright.request.newContext(settings);
  let anonymousReplay: APIRequestContext | undefined;
  let signedInReplay: APIRequestContext | undefined;
  try {
    await csrf(client);
    const anonymousState = await client.storageState();
    await register(client, `${randomUUID()}@example.test`);
    const signedInState = await client.storageState();
    const sessionValue = (state: typeof anonymousState) => state.cookies.find(item => item.name === 'marvel_heroes_session')?.value;
    expect(sessionValue(anonymousState)).toBeDefined();
    expect(sessionValue(signedInState)).not.toBe(sessionValue(anonymousState));

    anonymousReplay = await playwright.request.newContext({ ...settings, storageState: anonymousState });
    expect((await anonymousReplay.get('/api/v1/me')).status()).toBe(401);
    expect((await client.get('/api/v1/me')).status()).toBe(200);

    expect((await client.post('/api/v1/auth/logout', { headers: await csrf(client) })).status()).toBe(204);
    signedInReplay = await playwright.request.newContext({ ...settings, storageState: signedInState });
    const rejected = await signedInReplay.get('/api/v1/me');
    expect(rejected.status()).toBe(401);
    expect(await rejected.json()).toMatchObject({ code: 'unauthenticated' });
    expect(rejected.headers()['cache-control']).toBe('no-store, private');
    expect((await signedInReplay.get('/api/v1/characters')).status()).toBe(200);
  } finally {
    await anonymousReplay?.dispose();
    await signedInReplay?.dispose();
    await client.dispose();
  }
});

test('logging out one device preserves another session for the same identity', async ({ playwright, baseURL }) => {
  const settings = { baseURL, extraHTTPHeaders: { 'X-Marvel-Test-Scenario': randomUUID() } };
  const first = await playwright.request.newContext(settings);
  const second = await playwright.request.newContext(settings);
  try {
    const email = `${randomUUID()}@example.test`;
    const id = await register(first, email);
    const login = await second.post('/api/v1/auth/login', { headers: await csrf(second), data: { email, password } });
    expect(login.status()).toBe(200);
    expect(await login.json()).toMatchObject({ data: { id, email } });

    expect((await first.post('/api/v1/auth/logout', { headers: await csrf(first) })).status()).toBe(204);
    expect((await first.get('/api/v1/me')).status()).toBe(401);
    const remaining = await second.get('/api/v1/me');
    expect(remaining.status()).toBe(200);
    expect(await remaining.json()).toMatchObject({ data: { id, email } });
    expect((await second.post('/api/v1/auth/logout', { headers: await csrf(second) })).status()).toBe(204);
    expect((await second.get('/api/v1/me')).status()).toBe(401);
  } finally {
    await first.dispose();
    await second.dispose();
  }
});
