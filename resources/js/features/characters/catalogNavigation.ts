import type { LocationQuery, LocationQueryValue } from 'vue-router';

export function catalogPage(value: LocationQueryValue | LocationQueryValue[] | undefined): number {
  const parsed = typeof value === 'string' && /^[1-9][0-9]*$/.test(value) ? Number(value) : 1;
  return Number.isSafeInteger(parsed) ? parsed : 1;
}

export function catalogReturnQuery(query: LocationQuery): LocationQuery {
  const result = characterReturnQuery(query);
  delete result.stories_page;
  return result;
}

export function characterReturnQuery(query: LocationQuery): LocationQuery {
  const result = { ...query };
  delete result.character;
  delete result.comics_page;
  return result;
}

export function returnCharacterId(query: LocationQuery): string | null {
  const value = query.character;
  return typeof value === 'string' && /^[1-9][0-9]*$/.test(value) && Number.isSafeInteger(Number(value)) ? value : null;
}
