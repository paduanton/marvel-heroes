<?php

use App\Http\Controllers\API\MarvelController;
use App\Http\Middleware\CatalogCacheMetadata;
use App\Http\Middleware\ValidateCatalogIdentifiers;
use App\Modules\Characters\Presentation\Controllers\ListCharactersController;
use App\Modules\Characters\Presentation\Controllers\ListCharacterStoriesController;
use App\Modules\Characters\Presentation\Controllers\ShowCharacterController;
use App\Modules\Comics\Presentation\Controllers\ListStoryComicsController;
use Illuminate\Support\Facades\Route;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider within a group which
| is assigned the "api" middleware group. Enjoy building your API!
|
*/

Route::prefix('v1')->name('catalog.')->withoutMiddleware(EnsureFrontendRequestsAreStateful::class)->middleware(['throttle:catalog', ValidateCatalogIdentifiers::class, CatalogCacheMetadata::class])->group(function () {
    Route::get('characters', ListCharactersController::class)->name('characters.index');
    Route::get('characters/{characterId}', ShowCharacterController::class)->whereNumber('characterId')->name('characters.show');
    Route::get('characters/{characterId}/stories', ListCharacterStoriesController::class)->whereNumber('characterId')->name('characters.stories');
    Route::get('stories/{storyId}/comics', ListStoryComicsController::class)->whereNumber('storyId')->name('stories.comics');
});

Route::name('legacy.')->withoutMiddleware(EnsureFrontendRequestsAreStateful::class)->middleware(['throttle:catalog', ValidateCatalogIdentifiers::class])->group(function () {
    Route::get('character/{name}', [MarvelController::class, 'getCharacterId'])->name('characters.index');
    Route::get('character/id/{idCharacter}', [MarvelController::class, 'getCharacteryById'])->whereNumber('idCharacter')->name('characters.show');
    Route::get('character/stories/{idCharacter}', [MarvelController::class, 'getStoriesByCharacterId'])->whereNumber('idCharacter')->name('characters.stories');
    Route::get('character/comics/{storyId}', [MarvelController::class, 'getComicsByStoryId'])->whereNumber('storyId')->name('stories.comics');
});

Route::fallback(fn () => throw new NotFoundHttpException);
