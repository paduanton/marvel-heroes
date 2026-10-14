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

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Route;

require __DIR__.'/identity.php';

Route::get('/health', fn () => response()->json(['status' => 'ok']))->withoutMiddleware('web');
Route::get('/ready', function () {
    try {
        Cache::store()->get('marvel:readiness');
        if (blank(config('marvel.public_key')) || blank(config('marvel.private_key'))) {
            return response()->json(['status' => 'not_ready'], 503);
        }

        return response()->json(['status' => 'ready']);
    } catch (Throwable) {
        return response()->json(['status' => 'not_ready'], 503);
    }
})->withoutMiddleware('web');

Route::view('/{any?}', 'app')->where('any', '^(?!api(?:/|$)).*$');
