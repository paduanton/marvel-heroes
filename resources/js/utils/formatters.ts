export function excerpt(value: string | null, length = 150): string {
  if (!value) return 'No official description is available for this character.';
  return value.length > length ? `${value.slice(0, length).trimEnd()}...` : value;
}

export function displayDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' }).format(date);
}

export function initials(value: string): string {
  return value.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}
