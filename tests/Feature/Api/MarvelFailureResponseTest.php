<?php

namespace Tests\Feature\Api;

use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class MarvelFailureResponseTest extends TestCase
{
    #[DataProvider('upstreamFailures')]
    public function test_it_translates_upstream_errors_through_the_real_gateway(
        string $path,
        int $upstreamStatus,
        int $responseStatus,
        string $code,
    ): void {
        config([
            'marvel.base_url' => 'https://marvel.test/v1/public',
            'marvel.public_key' => 'test-public',
            'marvel.private_key' => 'test-private',
            'marvel.retry_times' => 2,
        ]);
        Http::preventStrayRequests();
        Http::fake(['marvel.test/*' => Http::response(['message' => 'Upstream-only diagnostic'], $upstreamStatus)]);

        $this->getJson($path)
            ->assertStatus($responseStatus)
            ->assertHeader('Content-Type', 'application/problem+json')
            ->assertHeader('X-Request-ID')
            ->assertJsonPath('code', $code)
            ->assertDontSee('Upstream-only diagnostic');

        Http::assertSentCount(1);
    }

    public static function upstreamFailures(): array
    {
        return [
            'missing character' => ['/api/v1/characters/999', 404, 404, 'resource-not-found'],
            'rate limited upstream' => ['/api/v1/characters', 429, 502, 'upstream-unavailable'],
            'upstream failure' => ['/api/v1/characters', 500, 502, 'upstream-unavailable'],
            'upstream unavailable' => ['/api/v1/characters', 503, 502, 'upstream-unavailable'],
        ];
    }
}
