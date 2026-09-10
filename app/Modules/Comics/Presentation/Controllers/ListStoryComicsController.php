<?php

namespace App\Modules\Comics\Presentation\Controllers;

use App\Modules\Characters\Presentation\Requests\ListRelatedCatalogRequest;
use App\Modules\Comics\Application\ListStoryComics;
use App\Modules\Comics\Presentation\Resources\ComicResource;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

final class ListStoryComicsController
{
    public function __invoke(int $storyId, ListRelatedCatalogRequest $request, ListStoryComics $action): AnonymousResourceCollection
    {
        $page = $action->handle($storyId, $request->page(), $request->perPage(20));

        return ComicResource::collection($page->items)->additional(['meta' => $page->meta()]);
    }
}
