import { isAxiosError, isCancel } from 'axios';
import { api } from './api';
import type { IdentityResource, Login, Registration } from '@/types/identity';

export class IdentityApiError extends Error {
  readonly status?: number;
  readonly fields: string[];

  constructor(error: unknown) {
    const response = isAxiosError<unknown>(error) ? error.response : undefined;
    const body = response?.data;
    const record = body !== null && typeof body === 'object' && !Array.isArray(body) ? body : undefined;
    const code = record && 'code' in record ? record.code : undefined;
    const message = response?.status === 419 && code === 'csrf-mismatch' ? 'Your session expired. Please try again.'
      : response?.status === 422 && code === 'validation-failed' ? 'Check your details and try again.'
        : response?.status === 429 ? 'Too many attempts. Please wait before trying again.'
          : response?.status === 403 ? 'You do not have access to this account.'
            : 'Unable to access your account right now.';
    super(message);
    this.name = 'IdentityApiError';
    this.status = response?.status;
    const errors = record && 'errors' in record ? record.errors : undefined;
    this.fields = response?.status === 422 && code === 'validation-failed' && errors !== null && typeof errors === 'object' && !Array.isArray(errors)
      ? Object.keys(errors).filter(field => ['name', 'email', 'password', 'password_confirmation'].includes(field)) : [];
  }
}

async function identityRequest<T>(request: () => Promise<T>): Promise<T> {
  try { return await request(); } catch (error) {
    if (isCancel(error)) throw error;
    throw new IdentityApiError(error);
  }
}

async function csrf(signal?: AbortSignal) {
  await api.get('/sanctum/csrf-cookie', { baseURL: '/', signal });
}

export async function currentIdentity(signal?: AbortSignal) {
  try {
    return await identityRequest(async () => (await api.get<IdentityResource>('/me', { signal })).data.data);
  } catch (error) {
    if (error instanceof IdentityApiError && error.status === 401) return null;
    throw error;
  }
}

export function login(input: Login, signal?: AbortSignal) {
  return identityRequest(async () => {
    await csrf(signal);
    return (await api.post<IdentityResource>('/auth/login', input, { signal })).data.data;
  });
}

export function register(input: Registration, signal?: AbortSignal) {
  return identityRequest(async () => {
    await csrf(signal);
    return (await api.post<IdentityResource>('/auth/register', input, { signal })).data.data;
  });
}

export function logout(signal?: AbortSignal) {
  return identityRequest(async () => {
    await csrf(signal);
    await api.post('/auth/logout', undefined, { signal });
  });
}
