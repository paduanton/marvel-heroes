const graphemes = new Intl.Segmenter('en', { granularity: 'grapheme' });

export function excerpt(value: string | null, length = 150, fallback = 'No official description is available for this character.'): string {
  if (!value?.trim()) return fallback;
  const characters = Array.from(graphemes.segment(value), part => part.segment);
  return characters.length > length ? `${characters.slice(0, length).join('').trimEnd()}...` : value;
}

export function displayDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date);
}

export function initials(value: string): string {
  return value.trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map(part => graphemes.segment(part)[Symbol.iterator]().next().value?.segment ?? '').join('').toUpperCase();
}

export function displayPublicationDate(value: string | null): string | null {
  if (!value || Number.isNaN(new Date(value).getTime())) return null;
  // Publication dates are calendar labels, not instants converted to the visitor's timezone.
  const calendar = value.slice(0, 10);
  const date = new Date(`${calendar}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== calendar) return null;
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}
