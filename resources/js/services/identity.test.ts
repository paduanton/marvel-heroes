import { AxiosError, CanceledError } from 'axios';
import { afterEach, expect, it } from 'vitest';
import { api } from './api';
import { currentIdentity, login, logout, register } from './identity';

const original = api.defaults.adapter;
afterEach(() => { api.defaults.adapter = original; });

it('bootstraps CSRF before a session mutation without requesting a bearer token', async () => {
  const requests: string[] = [];
  api.defaults.adapter = async (config) => {
    requests.push(`${config.method} ${api.getUri(config)}`);
    expect(config.headers.Authorization).toBeUndefined();
    return { config, headers: {}, status: 200, statusText: 'OK', data: { data: { id: 1, name: 'Visitor', email: 'visitor@example.test' } } };
  };
  await expect(login({ email: 'visitor@example.test', password: 'test-passphrase' })).resolves.toMatchObject({ id: 1 });
  expect(requests).toEqual(['get /sanctum/csrf-cookie', 'post /api/v1/auth/login']);
});

it('does not replay a mutation after CSRF failure and never exposes server detail', async () => {
  let posts = 0;
  api.defaults.adapter = async (config) => {
    if (config.method === 'post') {
      posts++;
      throw new AxiosError('failure', undefined, config, undefined, {
        config, headers: {}, status: 419, statusText: 'Expired', data: { code: 'csrf-mismatch', detail: 'unsafe server detail' },
      });
    }
    return { config, headers: {}, status: 204, statusText: 'OK', data: null };
  };
  await expect(logout()).rejects.toMatchObject({ status: 419, message: 'Your session expired. Please try again.' });
  expect(posts).toBe(1);
});

it('returns anonymous state only for 401, not network or server failures', async () => {
  api.defaults.adapter = async (config) => { throw new AxiosError('unauthorized', undefined, config, undefined, {
    config, headers: {}, status: 401, statusText: 'Unauthorized', data: {},
  }); };
  await expect(currentIdentity()).resolves.toBeNull();
  api.defaults.adapter = async () => { throw new Error('offline'); };
  await expect(currentIdentity()).rejects.toMatchObject({ message: 'Unable to access your account right now.' });
});

it('preserves cancellation before registration dispatch', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(register({ name: 'Visitor', email: 'visitor@example.test', password: 'test-passphrase', password_confirmation: 'test-passphrase' }, controller.signal)).rejects.toBeInstanceOf(CanceledError);
});

const mutations = [
  { name: 'login', send: (signal?: AbortSignal) => login({ email: 'visitor@example.test', password: 'test-passphrase' }, signal) },
  { name: 'register', send: (signal?: AbortSignal) => register({ name: 'Visitor', email: 'visitor@example.test', password: 'test-passphrase', password_confirmation: 'test-passphrase' }, signal) },
  { name: 'logout', send: (signal?: AbortSignal) => logout(signal) },
];

it.each(mutations)('does not dispatch $name when CSRF bootstrap fails', async ({ send }) => {
  const methods: string[] = [];
  api.defaults.adapter = async config => {
    methods.push(config.method!);
    throw new AxiosError('unsafe transport detail', undefined, config, undefined, {
      config, headers: {}, status: 503, statusText: 'Unavailable', data: { detail: 'unsafe server diagnostic' },
    });
  };
  await expect(send()).rejects.toMatchObject({ status: 503, message: 'Unable to access your account right now.' });
  expect(methods).toEqual(['get']);
});

it.each(mutations)('preserves $name cancellation during CSRF without issuing a mutation', async ({ send }) => {
  const controller = new AbortController();
  const methods: string[] = [];
  api.defaults.adapter = async config => {
    methods.push(config.method!);
    controller.abort();
    return { config, headers: {}, status: 204, statusText: 'OK', data: null };
  };
  await expect(send(controller.signal)).rejects.toBeInstanceOf(CanceledError);
  expect(methods).toEqual(['get']);
});

it.each(mutations)('preserves cancellation after $name dispatch without replaying it', async ({ send }) => {
  const controller = new AbortController();
  const methods: string[] = [];
  api.defaults.adapter = async config => {
    methods.push(config.method!);
    if (config.method === 'post') controller.abort();
    return { config, headers: {}, status: 200, statusText: 'OK', data: { data: { id: 1, name: 'Visitor', email: 'visitor@example.test' } } };
  };
  await expect(send(controller.signal)).rejects.toBeInstanceOf(CanceledError);
  expect(methods).toEqual(['get', 'post']);
});

it.each([403, 419, 429, 500, 503])('does not treat a %s session lookup failure as anonymous', async status => {
  api.defaults.adapter = async config => { throw new AxiosError('failure', undefined, config, undefined, {
    config, headers: {}, status, statusText: 'Failed', data: {},
  }); };
  await expect(currentIdentity()).rejects.toMatchObject({ status });
});

it('uses only known validation field names, never arbitrary response diagnostics', async () => {
  api.defaults.adapter = async config => { throw new AxiosError('failure', undefined, config, undefined, {
    config, headers: {}, status: 422, statusText: 'Invalid',
    data: { code: 'validation-failed', detail: 'unsafe detail', errors: { email: ['unsafe detail'], password_hash: ['unsafe detail'], session_cookie: ['unsafe detail'] } },
  }); };
  await expect(login({ email: 'visitor@example.test', password: 'test-passphrase' })).rejects.toMatchObject({ fields: ['email'], message: 'Check your details and try again.' });
});
