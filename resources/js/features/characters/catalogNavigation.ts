import type { LocationQuery } from 'vue-router';

export function catalogReturnQuery(query: LocationQuery): LocationQuery {
  const result = { ...query };
  delete result.character;
  return result;
}

export function returnCharacterId(query: LocationQuery): string | null {
  const value = query.character;
  return typeof value === 'string' && /^[1-9][0-9]*$/.test(value) && Number.isSafeInteger(Number(value)) ? value : null;
}
