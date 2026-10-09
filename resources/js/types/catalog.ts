import type { components } from './generated/api';

export type Character = components['schemas']['Character'];
export type Story = components['schemas']['Story'];
export type Comic = components['schemas']['Comic'];
export type PageMeta = components['schemas']['Meta'];
export type CharacterResource = components['schemas']['CharacterResource'];
export type CharacterCollection = components['schemas']['CharacterCollection'];
export type StoryCollection = components['schemas']['StoryCollection'];
export type ComicCollection = components['schemas']['ComicCollection'];

export interface ApiCollection<T> {
  data: T[];
  meta: PageMeta;
}
