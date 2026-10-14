<?php

use App\Http\Middleware\ApiCacheHeaders;
use App\Http\Middleware\RequestId;
use App\Http\Middleware\SecurityHeaders;
use App\Shared\Marvel\Exceptions\MarvelBudgetExhaustedException;
use App\Shared\Marvel\Exceptions\MarvelRefreshInProgressException;
use App\Shared\Marvel\Exceptions\MarvelUnavailableException;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;
use Illuminate\Session\TokenMismatchException;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;

$problem = static function (Request $request, int $status, string $code, string $detail, array $extra = []) {
    return response()->json(array_merge([
        'type' => "https://marvel-heroes.local/problems/{$code}",
        'title' => str_replace('-', ' ', $code),
        'status' => $status,
        'code' => $code,
        'detail' => $detail,
        'request_id' => $request->attributes->get('request_id'),
    ], $extra), $status, ['Content-Type' => 'application/problem+json']);
};

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withCommands([__DIR__.'/../app/Console/Commands'])
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->statefulApi();
        $middleware->redirectGuestsTo(fn (Request $request) => $request->is('api/*') ? null : '/login');
        $middleware->append([RequestId::class, SecurityHeaders::class, ApiCacheHeaders::class]);
    })
    ->withExceptions(function (Exceptions $exceptions) use ($problem): void {
        $exceptions->render(function (AuthenticationException $exception, Request $request) use ($problem) {
            return $request->is('api/*') ? $problem($request, 401, 'unauthenticated', 'Sign in to access this resource.') : null;
        });
        $exceptions->render(function (AuthorizationException $exception, Request $request) use ($problem) {
            return $request->is('api/*') ? $problem($request, 403, 'forbidden', 'You are not authorized to access this resource.') : null;
        });
        $exceptions->render(function (TokenMismatchException $exception, Request $request) use ($problem) {
            return $request->is('api/*') ? $problem($request, 419, 'csrf-mismatch', 'Your session has expired. Please sign in again.') : null;
        });
        $exceptions->render(function (QueryException $exception, Request $request) use ($problem) {
            return $request->is('api/v1/auth/*', 'api/v1/me') ? $problem($request, 503, 'identity-unavailable', 'Identity is temporarily unavailable.') : null;
        });
        $exceptions->render(function (MarvelBudgetExhaustedException $exception, Request $request) use ($problem) {
            return $request->is('api/*') ? $problem($request, 503, 'upstream-budget-exhausted', 'Catalog data is temporarily unavailable.') : null;
        });
        $exceptions->render(function (MarvelRefreshInProgressException $exception, Request $request) use ($problem) {
            return $request->is('api/*') ? $problem($request, 503, 'cache-refresh-in-progress', 'Catalog data is temporarily unavailable.') : null;
        });
        $exceptions->render(function (MarvelUnavailableException $exception, Request $request) use ($problem) {
            return $request->is('api/*') ? $problem($request, 502, 'upstream-unavailable', 'The catalog source is temporarily unavailable.') : null;
        });
        $exceptions->render(function (ValidationException $exception, Request $request) use ($problem) {
            return $request->is('api/*') ? $problem($request, 422, 'validation-failed', 'One or more request parameters are invalid.', ['errors' => $exception->errors()]) : null;
        });
        $exceptions->render(function (HttpExceptionInterface $exception, Request $request) use ($problem) {
            if (! $request->is('api/*')) {
                return null;
            }
            $status = $exception->getStatusCode();
            if ($status === 404) {
                return $problem($request, 404, 'resource-not-found', 'The requested catalog resource was not found.');
            }
            if ($status === 429) {
                return $problem($request, 429, 'rate-limit-exceeded', 'Too many requests. Please retry later.')->withHeaders($exception->getHeaders());
            }
            if ($status === 403) {
                return $problem($request, 403, 'forbidden', 'You are not authorized to access this resource.');
            }
            if ($status === 419) {
                return $problem($request, 419, 'csrf-mismatch', 'Your session has expired. Please sign in again.');
            }

            return null;
        });
    })
    ->create();
