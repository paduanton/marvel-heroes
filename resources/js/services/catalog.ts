import { isCancel } from 'axios';
import { api, CatalogApiError } from './api';
import type { CatalogSource, CharacterCollection, CharacterResource, ComicCollection, ComicResource, StoryCollection } from '@/types/catalog';

function query(params: Record<string, string | number | undefined>) {
  return Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined && value !== ''));
}

type SearchParams = { query?: string; page: number; perPage: number; source?: CatalogSource };

export async function listCharacters(params: SearchParams, signal?: AbortSignal) {
  try {
    const response = await api.get<CharacterCollection>('/characters', {
      params: query({ query: params.query, page: params.page, per_page: params.perPage, source: params.source }),
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
    const response = await api.get<CharacterResource>(`/characters/${id}`, { signal });
    return response.data;
  } catch (error) {
    if (isCancel(error)) throw error;
    throw new CatalogApiError(error);
  }
}

export async function listStories(characterId: string | number, params: { page: number; perPage: number }, signal?: AbortSignal) {
  try {
    const response = await api.get<StoryCollection>(`/characters/${characterId}/stories`, {
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
    const response = await api.get<ComicCollection>(`/stories/${storyId}/comics`, {
      params: query({ page: params.page, per_page: params.perPage }), signal,
    });
    return response.data;
  } catch (error) {
    if (isCancel(error)) throw error;
    throw new CatalogApiError(error);
  }
}

async function readComicCatalog<T>(path: string, params: Record<string, string | number | undefined>, signal?: AbortSignal): Promise<T> {
  try {
    const response = await api.get<T>(path, { params: query(params), signal });
    return response.data;
  } catch (error) {
    if (isCancel(error)) throw error;
    throw new CatalogApiError(error);
  }
}

export function searchComics(params: SearchParams, signal?: AbortSignal) {
  return readComicCatalog<ComicCollection>('/comics', {
    query: params.query, page: params.page, per_page: params.perPage, source: params.source,
  }, signal);
}

export function getComic(id: string, signal?: AbortSignal) {
  return readComicCatalog<ComicResource>(`/comics/${encodeURIComponent(id)}`, {}, signal);
}

export function listCharacterComics(id: string, params: { page: number; perPage: number }, signal?: AbortSignal) {
  return readComicCatalog<ComicCollection>(`/characters/${encodeURIComponent(id)}/comics`, {
    page: params.page, per_page: params.perPage,
  }, signal);
}
