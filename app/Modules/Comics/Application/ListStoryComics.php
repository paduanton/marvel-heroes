<?php

namespace App\Modules\Comics\Application;

use App\Modules\Characters\Domain\CatalogPage;
use App\Shared\Marvel\Contracts\MarvelCatalogGateway;

final readonly class ListStoryComics
{
    public function __construct(private MarvelCatalogGateway $catalog) {}

    public function handle(int $storyId, int $page, int $perPage): CatalogPage
    {
        $result = $this->catalog->comics($storyId, ($page - 1) * $perPage, $perPage);

        return new CatalogPage($result['items'], $page, $perPage, $result['total']);
    }
}
