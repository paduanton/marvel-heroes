import { isCancel } from 'axios';
import { api, CatalogApiError } from './api';
import type { ApiCollection, ApiResource, Character, Comic, Story } from '@/types/catalog';

function query(params: Record<string, string | number | undefined>) {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== ''));
}

export async function listCharacters(params: { query?: string; page: number; perPage: number }, signal?: AbortSignal) {
  try {
    const response = await api.get<ApiCollection<Character>>('/characters', {
      params: query({ query: params.query, page: params.page, per_page: params.perPage }),
      signal,
    });
    return response.data;
  } catch (error) {
    if (isCancel(error)) throw error;
    throw new CatalogApiError(error);
  }
}

export async function getCharacter(id: string | number, signal?: AbortSignal) {
  try {
    const response = await api.get<ApiResource<Character>>(`/characters/${id}`, { signal });
    return response.data.data;
  } catch (error) {
    if (isCancel(error)) throw error;
    throw new CatalogApiError(error);
  }
}

export async function listStories(characterId: string | number, params: { page: number; perPage: number }, signal?: AbortSignal) {
  try {
    const response = await api.get<ApiCollection<Story>>(`/characters/${characterId}/stories`, {
      params: query({ page: params.page, per_page: params.perPage }), signal,
    });
    return response.data;
  } catch (error) {
    if (isCancel(error)) throw error;
    throw new CatalogApiError(error);
  }
}

export async function listComics(storyId: string | number, params: { page: number; perPage: number }, signal?: AbortSignal) {
  try {
    const response = await api.get<ApiCollection<Comic>>(`/stories/${storyId}/comics`, {
      params: query({ page: params.page, per_page: params.perPage }), signal,
    });
    return response.data;
  } catch (error) {
    if (isCancel(error)) throw error;
    throw new CatalogApiError(error);
  }
}
