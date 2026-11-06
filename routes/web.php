<?php

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
|
| Here is where you can register web routes for your application. These
| routes are loaded by the RouteServiceProvider within a group which
| contains the "web" middleware group. Now create something great!
|
*/

use App\Shared\Catalog\LocalCatalog;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Route;

require __DIR__.'/identity.php';

Route::get('/health', fn () => response()->json(['status' => 'ok']))->withoutMiddleware('web');
Route::get('/ready', function () {
    try {
        Cache::store()->get('catalog:readiness');
        $ready = match (config('catalog.provider')) {
            'local' => app(LocalCatalog::class)->issues('', 0, 1)['total'] > 0,
            'marvel-fixture' => app()->environment('testing', 'integration')
                && filled(config('marvel.public_key')) && filled(config('marvel.private_key')),
            default => false,
        };

        return $ready ? response()->json(['status' => 'ready']) : response()->json(['status' => 'not_ready'], 503);
    } catch (Throwable) {
        return response()->json(['status' => 'not_ready'], 503);
    }
})->withoutMiddleware('web');

Route::view('/{any?}', 'app')->where('any', '^(?!api(?:/|$)).*$');
