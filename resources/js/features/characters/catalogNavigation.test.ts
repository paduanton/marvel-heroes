import { describe, expect, it } from 'vitest';
import { catalogReturnQuery, returnCharacterId } from './catalogNavigation';

describe('catalog return navigation', () => {
  it('preserves catalog parameters without mutating the current route', () => {
    const query = { query: 'sp', page: '2', source: 'demo', character: '1' };
    expect(catalogReturnQuery(query)).toEqual({ query: 'sp', page: '2', source: 'demo' });
    expect(query.character).toBe('1');
  });

  it('accepts a positive, safe character context', () => {
    expect(returnCharacterId({ character: '1009610' })).toBe('1009610');
  });

  it.each([null, '', '0', '-1', '1.5', '01', '1e2', '9007199254740992', ['1', '2']])('ignores invalid character context: %s', (character) => {
    expect(returnCharacterId({ character })).toBeNull();
  });
});
