<?php

namespace App\Providers;

use App\Modules\Identity\Domain\EmailAddress;
use App\Modules\Identity\Presentation\Policies\IdentityPolicy;
use App\Shared\Cache\CachedMarvelCatalogGateway;
use App\Shared\Cache\CatalogCacheMetadata;
use App\Shared\Marvel\Contracts\MarvelCatalogGateway;
use App\Shared\Marvel\MarvelHttpClient;
use App\Shared\Marvel\MarvelPayloadNormalizer;
use App\User;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
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
        $this->app->scoped(CatalogCacheMetadata::class);
        $this->app->scoped(MarvelCatalogGateway::class, fn ($app) => new CachedMarvelCatalogGateway(
            $app->make(MarvelHttpClient::class),
            $app->make(CatalogCacheMetadata::class),
        ));
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Gate::policy(User::class, IdentityPolicy::class);
        RateLimiter::for('identity-register', fn (Request $request) => Limit::perMinute(5)->by($request->ip()));
        RateLimiter::for('identity-login', function (Request $request): array {
            $input = $request->input('email');
            $email = EmailAddress::normalize(is_string($input) ? $input : '');

            return [
                Limit::perMinute(10)->by('ip:'.$request->ip()),
                Limit::perMinute(5)->by('email:'.hash('sha256', $email).'|'.$request->ip()),
            ];
        });
        RateLimiter::for('identity', fn (Request $request) => Limit::perMinute(60)->by((string) $request->user()?->getAuthIdentifier()));
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
