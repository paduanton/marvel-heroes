<?php

namespace App\Modules\Comics\Application;

use App\Modules\Characters\Domain\CatalogPage;
use App\Shared\Catalog\CatalogSourceUnavailableException;
use App\Shared\Catalog\LocalCatalog;

final readonly class BrowseComics
{
    public function __construct(private LocalCatalog $catalog) {}

    public function search(string $query, int $page, int $perPage, ?string $source): CatalogPage
    {
        if ($source === 'live') {
            throw new CatalogSourceUnavailableException;
        }

        $result = $this->catalog->issues($query, ($page - 1) * $perPage, $perPage);

        return new CatalogPage($result['items'], $page, $perPage, $result['total']);
    }

    /** @return array<string, mixed>|null */
    public function detail(int $comicId): ?array
    {
        return $this->catalog->issue($comicId);
    }

    public function forCharacter(int $characterId, int $page, int $perPage): CatalogPage
    {
        $result = $this->catalog->characterComics($characterId, ($page - 1) * $perPage, $perPage);

        return new CatalogPage($result['items'], $page, $perPage, $result['total']);
    }
}
