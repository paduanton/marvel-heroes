<?php

use App\Http\Controllers\API\MarvelController;
use App\Modules\Characters\Presentation\Controllers\ListCharactersController;
use App\Modules\Characters\Presentation\Controllers\ListCharacterStoriesController;
use App\Modules\Characters\Presentation\Controllers\ShowCharacterController;
use App\Modules\Comics\Presentation\Controllers\ListStoryComicsController;
use Illuminate\Support\Facades\Route;
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

Route::prefix('v1')->middleware('throttle:catalog')->group(function () {
    Route::get('characters', ListCharactersController::class);
    Route::get('characters/{characterId}', ShowCharacterController::class)->whereNumber('characterId');
    Route::get('characters/{characterId}/stories', ListCharacterStoriesController::class)->whereNumber('characterId');
    Route::get('stories/{storyId}/comics', ListStoryComicsController::class)->whereNumber('storyId');
});

Route::middleware('throttle:catalog')->group(function () {
    Route::get('character/{name}', [MarvelController::class, 'getCharacterId']);
    Route::get('character/id/{idCharacter}', [MarvelController::class, 'getCharacteryById'])->whereNumber('idCharacter');
    Route::get('character/stories/{idCharacter}', [MarvelController::class, 'getStoriesByCharacterId'])->whereNumber('idCharacter');
    Route::get('character/comics/{storyId}', [MarvelController::class, 'getComicsByStoryId'])->whereNumber('storyId');
});

Route::fallback(fn () => throw new NotFoundHttpException);
