import axios, { AxiosError } from 'axios';

export interface ApiProblem {
  code?: string;
  detail?: string;
  request_id?: string;
}

export class CatalogApiError extends Error {
  public readonly status?: number;
  public readonly code?: string;

  constructor(error: unknown) {
    const response = (error as AxiosError<ApiProblem>).response;
    super(response?.data?.detail ?? 'Unable to load the catalog right now.');
    this.status = response?.status;
    this.code = response?.data?.code;
  }
}

export const api = axios.create({
  baseURL: '/api/v1',
  headers: { Accept: 'application/json' },
  timeout: 10_000,
});
