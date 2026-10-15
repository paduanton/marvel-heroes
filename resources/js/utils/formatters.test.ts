import { describe, expect, it } from 'vitest';
import { displayPublicationDate, excerpt, initials } from './formatters';

describe('catalog formatters', () => {
  it('uses a readable fallback when no description exists', () => {
    expect(excerpt(null)).toContain('No official description');
  });

  it('creates initials from a character name', () => {
    expect(initials('Captain America')).toBe('CA');
  });

  it('uses the fallback for blank descriptions', () => {
    expect(excerpt(' \n\t ', 120, 'No comic description.')).toBe('No comic description.');
  });

  it('truncates complete visible characters rather than splitting emoji or accents', () => {
    expect(excerpt('A👩🏽‍🚀e\u0301B', 3)).toBe('A👩🏽‍🚀e\u0301...');
    expect(excerpt('👩🏽‍🚀e\u0301', 2)).toBe('👩🏽‍🚀e\u0301');
  });

  it('ignores surrounding whitespace and preserves complete initials', () => {
    expect(initials('  Captain   America  ')).toBe('CA');
    expect(initials('👩🏽‍🚀 e\u0301clair')).toBe('👩🏽‍🚀E\u0301');
    expect(initials(' \t ')).toBe('');
  });

  it('uses a resource-specific fallback without changing existing descriptions', () => {
    expect(excerpt(null, 120, 'No comic description.')).toBe('No comic description.');
    expect(excerpt('A comic description.', 120, 'No comic description.')).toBe('A comic description.');
  });

  it('preserves the publication calendar date regardless of its timezone offset', () => {
    expect(displayPublicationDate('2020-01-02T00:00:00+14:00')).toBe('Jan 2, 2020');
    expect(displayPublicationDate('2020-01-02T23:00:00-12:00')).toBe('Jan 2, 2020');
    expect(displayPublicationDate('2020-02-29T00:00:00Z')).toBe('Feb 29, 2020');
  });

  it('omits missing or invalid publication dates rather than rolling them forward', () => {
    for (const value of [null, '', 'not-a-date', '2020-02-30T00:00:00Z', '2020-13-01T00:00:00Z']) {
      expect(displayPublicationDate(value)).toBeNull();
    }
  });
});
