<?php

namespace Tests\Feature\Api;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class MarvelPayloadTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        config([
            'marvel.base_url' => 'https://marvel.test/v1/public',
            'marvel.public_key' => 'test-public',
            'marvel.private_key' => 'test-private',
            'marvel.timeout_seconds' => 5,
            'marvel.retry_times' => 2,
            'marvel.daily_budget' => 10,
            'marvel.cache.fresh_days' => 30,
            'marvel.cache.stale_days' => 180,
        ]);
        Http::preventStrayRequests();
    }

    public function test_it_does_not_cache_a_malformed_success_as_an_empty_catalog(): void
    {
        Http::fake(['marvel.test/*' => Http::sequence()
            ->push(['message' => 'Upstream-only diagnostic'])
            ->push(['data' => ['results' => [['id' => 1, 'name' => 'Example Hero']], 'total' => 1]])]);

        $this->getJson('/api/v1/characters')
            ->assertStatus(502)
            ->assertHeader('Content-Type', 'application/problem+json')
            ->assertJsonPath('code', 'upstream-unavailable')
            ->assertDontSee('Upstream-only diagnostic');
        Http::assertSentCount(1);

        $this->getJson('/api/v1/characters')->assertOk()->assertJsonPath('data.0.name', 'Example Hero');
        $this->getJson('/api/v1/characters')->assertOk()->assertJsonPath('data.0.name', 'Example Hero');
        Http::assertSentCount(2);
    }

    #[DataProvider('malformedCollections')]
    public function test_it_rejects_malformed_collection_structures(string $body): void
    {
        Http::fake(['marvel.test/*' => Http::response($body, 200, ['Content-Type' => 'application/json'])]);

        $this->getJson('/api/v1/characters')
            ->assertStatus(502)
            ->assertHeader('Content-Type', 'application/problem+json')
            ->assertJsonPath('code', 'upstream-unavailable');
        Http::assertSentCount(1);
    }

    public static function malformedCollections(): array
    {
        return [
            'invalid JSON' => ['{"data":'],
            'HTML success' => ['<html>Unavailable</html>'],
            'null response' => ['null'],
            'missing data' => ['{}'],
            'null data' => ['{"data":null}'],
            'missing results' => ['{"data":{"total":0}}'],
            'null results' => ['{"data":{"results":null,"total":0}}'],
            'object results' => ['{"data":{"results":{},"total":0}}'],
            'indexed object results' => ['{"data":{"results":{"0":{"id":1,"name":"Hero"}},"total":1}}'],
            'scalar result item' => ['{"data":{"results":[42],"total":1}}'],
            'array result item' => ['{"data":{"results":[[]],"total":1}}'],
            'missing total' => ['{"data":{"results":[]}}'],
            'null total' => ['{"data":{"results":[],"total":null}}'],
            'string total' => ['{"data":{"results":[],"total":"0"}}'],
            'negative total' => ['{"data":{"results":[],"total":-1}}'],
        ];
    }

    public function test_it_preserves_stale_data_until_a_valid_refresh_succeeds(): void
    {
        Http::fake(['marvel.test/*' => Http::sequence()
            ->push(['data' => ['results' => [['id' => 1, 'name' => 'Original Hero']], 'total' => 1]])
            ->push(['message' => 'Malformed response'])
            ->push(['message' => 'Malformed response'])
            ->push(['data' => ['results' => [['id' => 1, 'name' => 'Updated Hero']], 'total' => 1]])]);

        $this->getJson('/api/v1/characters')->assertOk()->assertJsonPath('data.0.name', 'Original Hero');
        $this->travel(31)->days();

        for ($attempt = 0; $attempt < 2; $attempt++) {
            $this->getJson('/api/v1/characters')->assertOk()->assertJsonPath('data.0.name', 'Original Hero');
        }
        Http::assertSentCount(3);

        $this->getJson('/api/v1/characters')->assertOk()->assertJsonPath('data.0.name', 'Updated Hero');
        $this->getJson('/api/v1/characters')->assertOk()->assertJsonPath('data.0.name', 'Updated Hero');
        Http::assertSentCount(4);
    }

    #[DataProvider('emptyResources')]
    public function test_it_distinguishes_malformed_responses_from_valid_empty_resources(string $path, int $status): void
    {
        Http::fake(['marvel.test/*' => Http::sequence()
            ->push(['message' => 'Malformed response'])
            ->push(['data' => ['results' => [], 'total' => 0]])]);

        $this->getJson($path)->assertStatus(502)->assertJsonPath('code', 'upstream-unavailable');

        for ($attempt = 0; $attempt < 2; $attempt++) {
            $response = $this->getJson($path)->assertStatus($status);
            if ($status === 200) {
                $response->assertJsonPath('data', [])->assertJsonPath('meta.total', 0);
            } else {
                $response->assertJsonPath('code', 'resource-not-found');
            }
        }
        Http::assertSentCount(2);
    }

    public static function emptyResources(): array
    {
        return [
            'characters' => ['/api/v1/characters', 200],
            'character detail' => ['/api/v1/characters/1', 404],
            'stories' => ['/api/v1/characters/1/stories', 200],
            'comics' => ['/api/v1/stories/1/comics', 200],
        ];
    }

    public function test_a_malformed_response_still_consumes_the_upstream_attempt(): void
    {
        config(['marvel.daily_budget' => 1]);
        Http::fake(['marvel.test/*' => Http::response(['message' => 'Malformed response'])]);

        $this->getJson('/api/v1/characters')->assertStatus(502)->assertJsonPath('code', 'upstream-unavailable');
        $this->getJson('/api/v1/characters')->assertStatus(503)->assertJsonPath('code', 'upstream-budget-exhausted');
        Http::assertSentCount(1);
    }
}
