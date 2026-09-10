import { describe, expect, it } from 'vitest';
import { excerpt, initials } from './formatters';

describe('catalog formatters', () => {
  it('uses a readable fallback when no description exists', () => {
    expect(excerpt(null)).toContain('No official description');
  });

  it('creates initials from a character name', () => {
    expect(initials('Captain America')).toBe('CA');
  });
});
