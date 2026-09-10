<?php

namespace App\Modules\Characters\Application;

use App\Modules\Characters\Domain\CatalogPage;
use App\Shared\Marvel\Contracts\MarvelCatalogGateway;

final readonly class ListCharacterStories
{
    public function __construct(private MarvelCatalogGateway $catalog) {}

    public function handle(int $characterId, int $page, int $perPage): CatalogPage
    {
        $result = $this->catalog->stories($characterId, ($page - 1) * $perPage, $perPage);

        return new CatalogPage($result['items'], $page, $perPage, $result['total']);
    }
}
