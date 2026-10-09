import axios, { AxiosError, isAxiosError } from 'axios';

const unavailable = 'Catalog is temporarily unavailable. Please try again later.';
const problemMessages = new Map<string, { status: number; message: string }>([
  ['resource-not-found', { status: 404, message: 'This catalog item is not available.' }],
  ['validation-failed', { status: 422, message: 'Check the search and page parameters, then try again.' }],
  ['rate-limit-exceeded', { status: 429, message: 'Too many requests. Please wait before trying again.' }],
  ['upstream-unavailable', { status: 502, message: unavailable }],
  ['upstream-budget-exhausted', { status: 503, message: unavailable }],
  ['cache-refresh-in-progress', { status: 503, message: 'Catalog is being refreshed. Please try again shortly.' }],
]);

export class CatalogApiError extends Error {
  public readonly status?: number;
  public readonly code?: string;
  public readonly requestId?: string;

  constructor(error: unknown) {
    const failure = isAxiosError<unknown>(error) ? error : undefined;
    const response = failure?.response;
    const data = response?.data;
    const body = data !== null && typeof data === 'object' && !Array.isArray(data) ? data : undefined;
    const code = body && 'code' in body && typeof body.code === 'string' ? body.code : undefined;
    const problem = code ? problemMessages.get(code) : undefined;
    const timedOut = failure?.code === AxiosError.ECONNABORTED || failure?.code === AxiosError.ETIMEDOUT;
    super(problem && problem.status === response?.status ? problem.message
      : timedOut ? 'The catalog request took too long. Please try again.'
        : 'Unable to load the catalog right now.');
    this.name = 'CatalogApiError';
    this.status = response?.status;
    this.code = code;
    this.requestId = body && 'request_id' in body && typeof body.request_id === 'string' ? body.request_id : undefined;
  }
}

export const api = axios.create({
  baseURL: '/api/v1',
  headers: { Accept: 'application/json' },
  timeout: 10_000,
});
