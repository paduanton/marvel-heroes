<?php

namespace App\Modules\Comics\Presentation\Controllers;

use App\Modules\Comics\Application\BrowseComics;
use App\Modules\Comics\Presentation\Requests\CharacterComicsRequest;
use App\Modules\Comics\Presentation\Resources\ComicResource;
use App\Shared\Catalog\Presentation\SearchCatalogRequest;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

final class ComicDiscoveryController
{
    public function index(SearchCatalogRequest $request, BrowseComics $action): AnonymousResourceCollection
    {
        $page = $action->search((string) $request->validated('query', ''), $request->page(), $request->perPage(20), $request->validated('source'));

        return ComicResource::collection($page->items)->additional(['meta' => $page->meta()]);
    }

    public function show(int $comicId, BrowseComics $action): ComicResource
    {
        return new ComicResource($action->detail($comicId) ?? throw new NotFoundHttpException('Comic not found.'));
    }

    public function forCharacter(int $characterId, CharacterComicsRequest $request, BrowseComics $action): AnonymousResourceCollection
    {
        $page = $action->forCharacter($characterId, $request->page(), $request->perPage(20), $request->validated('source'));

        return ComicResource::collection($page->items)->additional(['meta' => $page->meta()]);
    }
}
