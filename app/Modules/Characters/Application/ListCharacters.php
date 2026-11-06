<?php

namespace App\Modules\Characters\Application;

use App\Modules\Characters\Domain\CatalogPage;
use App\Shared\Catalog\CatalogSourceUnavailableException;
use App\Shared\Catalog\LocalCatalog;
use App\Shared\Marvel\Contracts\MarvelCatalogGateway;

final readonly class ListCharacters
{
    public function __construct(private MarvelCatalogGateway $catalog, private LocalCatalog $local) {}

    public function handle(string $query, int $page, int $perPage, ?string $source = null): CatalogPage
    {
        if ($source === 'live' && $this->catalog instanceof LocalCatalog) {
            throw new CatalogSourceUnavailableException;
        }

        $query = mb_strtolower(trim($query));
        $catalog = $source === 'local' ? $this->local : $this->catalog;
        $result = $catalog->characters($query, ($page - 1) * $perPage, $perPage);

        return new CatalogPage($result['items'], $page, $perPage, $result['total']);
    }
}
