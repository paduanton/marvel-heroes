<?php

namespace App\Modules\Characters\Application;

use App\Modules\Characters\Domain\CatalogPage;
use App\Shared\Marvel\Contracts\MarvelCatalogGateway;

final readonly class ListCharacters
{
    public function __construct(private MarvelCatalogGateway $catalog) {}

    public function handle(string $query, int $page, int $perPage): CatalogPage
    {
        $query = mb_strtolower(trim($query));
        $result = $this->catalog->characters($query, ($page - 1) * $perPage, $perPage);

        return new CatalogPage($result['items'], $page, $perPage, $result['total']);
    }
}
