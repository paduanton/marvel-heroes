<?php

namespace App\Providers;

use App\Shared\Cache\CachedMarvelCatalogGateway;
use App\Shared\Marvel\Contracts\MarvelCatalogGateway;
use App\Shared\Marvel\MarvelHttpClient;
use App\Shared\Marvel\MarvelPayloadNormalizer;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(MarvelPayloadNormalizer::class);
        $this->app->singleton(MarvelHttpClient::class);
        $this->app->singleton(MarvelCatalogGateway::class, fn ($app) => new CachedMarvelCatalogGateway($app->make(MarvelHttpClient::class)));
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        RateLimiter::for('catalog', fn (Request $request) => Limit::perMinute(60)
            ->by($request->ip())
            ->response(function (Request $request, array $headers) {
                Log::warning('catalog.rate_limited', ['ip' => $request->ip()]);

                return response()->json([
                    'type' => 'https://marvel-heroes.local/problems/rate-limit-exceeded',
                    'title' => 'rate limit exceeded',
                    'status' => 429,
                    'code' => 'rate-limit-exceeded',
                    'detail' => 'Too many catalog requests. Please retry later.',
                    'request_id' => $request->attributes->get('request_id'),
                ], 429, array_merge(['Content-Type' => 'application/problem+json'], $headers));
            }));
    }
}
