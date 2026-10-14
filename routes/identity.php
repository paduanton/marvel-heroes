<?php

use App\Modules\Identity\Presentation\Controllers\CurrentIdentityController;
use App\Modules\Identity\Presentation\Controllers\LoginIdentityController;
use App\Modules\Identity\Presentation\Controllers\LogoutIdentityController;
use App\Modules\Identity\Presentation\Controllers\RegisterIdentityController;
use Illuminate\Support\Facades\Route;

// Loaded by web.php: sessions and CSRF apply even without an Origin header.
Route::prefix('api/v1')->group(function () {
    Route::post('auth/register', RegisterIdentityController::class)->middleware('throttle:identity-register');
    Route::post('auth/login', LoginIdentityController::class)->middleware('throttle:identity-login');
    Route::middleware(['auth:sanctum', 'throttle:identity'])->group(function () {
        Route::post('auth/logout', LogoutIdentityController::class);
        Route::get('me', CurrentIdentityController::class);
    });
});
