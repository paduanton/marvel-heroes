import { describe, expect, it } from 'vitest';
import { excerpt, initials } from './formatters';

describe('catalog formatters', () => {
  it('uses a readable fallback when no description exists', () => {
    expect(excerpt(null)).toContain('No official description');
  });

  it('creates initials from a character name', () => {
    expect(initials('Captain America')).toBe('CA');
  });

  it('uses a resource-specific fallback without changing existing descriptions', () => {
    expect(excerpt(null, 120, 'No comic description.')).toBe('No comic description.');
    expect(excerpt('A comic description.', 120, 'No comic description.')).toBe('A comic description.');
  });
});
