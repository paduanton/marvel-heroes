import type { Router } from 'vue-router';
import { useCatalogSearch } from '@/composables/useCatalogSearch';
import { listCharacters } from '@/services/catalog';

export function useCharacterCatalog(router: Router) {
  return useCatalogSearch(router, 'characters', 'Discover Marvel characters', listCharacters);
}
