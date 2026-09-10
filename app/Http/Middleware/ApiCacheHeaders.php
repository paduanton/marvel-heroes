<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class ApiCacheHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        if (! $request->is('api/*') || ! $request->isMethod('GET') || $response->getStatusCode() !== 200) {
            return $response;
        }

        $etag = '"'.hash('sha256', (string) $response->getContent()).'"';
        $response->headers->set('ETag', $etag);
        $response->headers->set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
        $response->headers->set('Vary', 'Accept-Encoding');

        if ($request->header('If-None-Match') === $etag) {
            return response()->noContent(304)->withHeaders($response->headers->all());
        }

        return $response;
    }
}
