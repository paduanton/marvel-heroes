<?php

namespace Tests\Feature\Api;

use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class PublicCatalogSessionIsolationTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config([
            'cache.default' => 'array', 'session.driver' => 'redis', 'session.connection' => 'default',
            'database.redis.default' => ['host' => '127.0.0.1', 'port' => 1, 'database' => 0, 'timeout' => 0.1, 'read_timeout' => 0.1, 'max_retries' => 0],
            'sanctum.stateful' => ['localhost'],
            'marvel.base_url' => 'https://marvel.test/v1/public',
            'marvel.public_key' => 'test-only', 'marvel.private_key' => 'test-only',
        ]);
        Http::preventStrayRequests();
        Http::fake(function ($request) {
            $record = match (true) {
                str_contains($request->url(), '/comics') => ['id' => 1001, 'title' => 'Synthetic comic'],
                str_contains($request->url(), '/stories') => ['id' => 101, 'title' => 'Synthetic story'],
                default => ['id' => 1, 'name' => 'Synthetic character'],
            };

            return Http::response(['data' => ['results' => [$record], 'total' => 1]]);
        });
    }

    #[DataProvider('publicCatalogPaths')]
    public function test_public_reads_ignore_session_cookies_and_preserve_shared_cache_responses(string $path): void
    {
        $anonymous = $this->getJson($path)->assertOk()->assertHeaderMissing('Set-Cookie')->assertHeader('ETag');
        $etag = $anonymous->headers->get('ETag');
        $payload = $anonymous->json();
        $this->withHeaders(['Origin' => 'http://localhost', 'Referer' => 'http://localhost/account'])
            ->withCookie(config('session.cookie'), 'synthetic-session-cookie');

        $this->getJson($path)->assertOk()->assertExactJson($payload)
            ->assertHeader('ETag', $etag)->assertHeader('Cache-Control', 'max-age=300, public, stale-while-revalidate=86400')
            ->assertHeaderMissing('Set-Cookie');
        $this->getJson($path, ['If-None-Match' => $etag])->assertStatus(304)
            ->assertHeader('ETag', $etag)->assertHeaderMissing('Set-Cookie');
        Http::assertSentCount(1);
    }

    public static function publicCatalogPaths(): array
    {
        return [
            'characters' => ['/api/v1/characters'],
            'character detail' => ['/api/v1/characters/1'],
            'character stories' => ['/api/v1/characters/1/stories'],
            'story comics' => ['/api/v1/stories/101/comics'],
            'legacy characters' => ['/api/character/spider'],
            'legacy character detail' => ['/api/character/id/1'],
            'legacy stories' => ['/api/character/stories/1'],
            'legacy comics' => ['/api/character/comics/101'],
        ];
    }
}
