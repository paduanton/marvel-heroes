<?php

namespace App\Modules\Characters\Presentation\Controllers;

use App\Modules\Characters\Application\ListCharacters;
use App\Modules\Characters\Presentation\Resources\CharacterResource;
use App\Shared\Catalog\Presentation\SearchCatalogRequest;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

final class ListCharactersController
{
    public function __invoke(SearchCatalogRequest $request, ListCharacters $action): AnonymousResourceCollection
    {
        $page = $action->handle((string) $request->validated('query', ''), $request->page(), $request->perPage(20), $request->validated('source'));

        return CharacterResource::collection($page->items)->additional(['meta' => $page->meta()]);
    }
}
