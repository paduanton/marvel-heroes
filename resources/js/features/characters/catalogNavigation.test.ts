import { describe, expect, it } from 'vitest';
import { catalogPage, catalogReturnQuery, characterReturnQuery, returnCharacterId } from './catalogNavigation';

describe('catalog return navigation', () => {
  it('preserves catalog parameters without mutating the current route', () => {
    const query = { query: 'sp', page: '2', source: 'demo', character: '1' };
    expect(catalogReturnQuery(query)).toEqual({ query: 'sp', page: '2', source: 'demo' });
    expect(query.character).toBe('1');
  });

  it('accepts a positive, safe character context', () => {
    expect(returnCharacterId({ character: '1009610' })).toBe('1009610');
  });

  it('removes only deeper navigation context when returning to a character or catalog', () => {
    const query = { query: 'sp', page: '4', stories_page: '2', comics_page: '3', character: '1', source: 'demo' };
    expect(characterReturnQuery(query)).toEqual({ query: 'sp', page: '4', stories_page: '2', source: 'demo' });
    expect(catalogReturnQuery(query)).toEqual({ query: 'sp', page: '4', source: 'demo' });
    expect(query).toEqual({ query: 'sp', page: '4', stories_page: '2', comics_page: '3', character: '1', source: 'demo' });
  });

  it.each([undefined, null, '', '0', '-1', '01', '1.5', '1e2', ' 2 ', '9007199254740992', ['2', '3']])('defaults malformed page %s to one', value => {
    expect(catalogPage(value)).toBe(1);
  });

  it('preserves supported safe page values', () => {
    expect(catalogPage('2')).toBe(2);
    expect(catalogPage('9007199254740991')).toBe(9007199254740991);
  });

  it.each([null, '', '0', '-1', '1.5', '01', '1e2', '9007199254740992', ['1', '2']])('ignores invalid character context: %s', (character) => {
    expect(returnCharacterId({ character })).toBeNull();
  });
});
