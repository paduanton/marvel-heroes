<?php

namespace App\Http\Middleware;

use App\Shared\Cache\CatalogCacheMetadata as CacheMetadata;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

final class CatalogCacheMetadata
{
    public function __construct(private readonly CacheMetadata $metadata) {}

    public function handle(Request $request, Closure $next): Response
    {
        $this->metadata->record(false);
        $response = $next($request);
        if ($response instanceof JsonResponse && $response->getStatusCode() === 200) {
            $body = $response->getData(true);
            $body['meta']['cache'] = ['state' => $this->metadata->state()];
            $response->setData($body);
        }

        return $response;
    }
}
