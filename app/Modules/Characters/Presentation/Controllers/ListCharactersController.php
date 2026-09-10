<?php

namespace App\Modules\Characters\Presentation\Controllers;

use App\Modules\Characters\Application\ListCharacters;
use App\Modules\Characters\Presentation\Requests\ListCharactersRequest;
use App\Modules\Characters\Presentation\Resources\CharacterResource;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

final class ListCharactersController
{
    public function __invoke(ListCharactersRequest $request, ListCharacters $action): AnonymousResourceCollection
    {
        $page = $action->handle((string) $request->validated('query', ''), $request->page(), $request->perPage(20));

        return CharacterResource::collection($page->items)->additional(['meta' => $page->meta()]);
    }
}
