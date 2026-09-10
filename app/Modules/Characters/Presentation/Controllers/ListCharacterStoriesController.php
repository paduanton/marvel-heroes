<?php

namespace App\Modules\Characters\Presentation\Controllers;

use App\Modules\Characters\Application\ListCharacterStories;
use App\Modules\Characters\Presentation\Requests\ListRelatedCatalogRequest;
use App\Modules\Characters\Presentation\Resources\StoryResource;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

final class ListCharacterStoriesController
{
    public function __invoke(int $characterId, ListRelatedCatalogRequest $request, ListCharacterStories $action): AnonymousResourceCollection
    {
        $page = $action->handle($characterId, $request->page(), $request->perPage(10));

        return StoryResource::collection($page->items)->additional(['meta' => $page->meta()]);
    }
}
