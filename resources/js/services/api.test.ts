import { AxiosError, AxiosHeaders } from 'axios';
import { describe, expect, it } from 'vitest';
import { CatalogApiError } from './api';

function httpFailure(status: number, data: unknown) {
  return new AxiosError('Internal transport diagnostic', undefined, undefined, undefined, {
    status, statusText: 'Failure', headers: {}, config: { headers: new AxiosHeaders() }, data,
  });
}

describe('catalog error presentation', () => {
  it.each([null, undefined, 42, 'raw failure', {}, new Error('Private diagnostic')])('handles unexpected failures safely: %s', (failure) => {
    const error = new CatalogApiError(failure);
    expect(error.message).toBe('Unable to load the catalog right now.');
    expect(error.status).toBeUndefined();
    expect(error.code).toBeUndefined();
  });

  it.each([
    [404, 'resource-not-found', 'This catalog item is not available.'],
    [422, 'validation-failed', 'Check the search and page parameters, then try again.'],
    [429, 'rate-limit-exceeded', 'Too many requests. Please wait before trying again.'],
    [502, 'upstream-unavailable', 'Catalog is temporarily unavailable. Please try again later.'],
    [503, 'upstream-budget-exhausted', 'Catalog is temporarily unavailable. Please try again later.'],
    [503, 'cache-refresh-in-progress', 'Catalog is being refreshed. Please try again shortly.'],
  ])('maps HTTP %i / %s to a stable message', (status, code, message) => {
    const error = new CatalogApiError(httpFailure(status as number, {
      code, detail: 'Private diagnostic', request_id: 'test-request-id',
    }));
    expect(error).toMatchObject({ status, code, message, requestId: 'test-request-id' });
    expect(error.message).not.toContain('Private diagnostic');
  });

  it.each([null, [], '<html>Private diagnostic</html>', { detail: 42, code: {} }, { code: 'unexpected', detail: 'Private diagnostic' }])(
    'uses a stable fallback for malformed or unknown HTTP bodies: %s', (body) => {
      expect(new CatalogApiError(httpFailure(500, body)).message).toBe('Unable to load the catalog right now.');
    },
  );

  it('does not trust a known code with an unrelated HTTP status', () => {
    expect(new CatalogApiError(httpFailure(500, { code: 'resource-not-found' })).message)
      .toBe('Unable to load the catalog right now.');
  });

  it('distinguishes a transport timeout from an upstream failure', () => {
    expect(new CatalogApiError(new AxiosError('timeout', AxiosError.ECONNABORTED)).message)
      .toBe('The catalog request took too long. Please try again.');
  });
});
