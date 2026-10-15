<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

final class RequestId
{
    public function handle(Request $request, Closure $next): Response
    {
        $started = hrtime(true);
        $candidate = (string) $request->header('X-Request-ID', '');
        $requestId = Str::isUuid($candidate) ? $candidate : (string) Str::uuid();
        $request->attributes->set('request_id', $requestId);
        Log::withContext(['request_id' => $requestId]);

        $response = $next($request);
        $response->headers->set('X-Request-ID', $requestId);
        Log::info('http.request_completed', [
            'method' => $request->method(),
            'route' => $request->route()?->uri(),
            'status' => $response->getStatusCode(),
            'duration_ms' => round((hrtime(true) - $started) / 1_000_000, 3),
        ]);

        return $response;
    }
}
