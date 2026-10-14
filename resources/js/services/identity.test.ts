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
