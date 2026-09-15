<?php

namespace Tests\Feature\Api;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class MarvelTimeoutTest extends TestCase
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
            'marvel.daily_budget' => 1,
            'marvel.cache.fresh_days' => 30,
            'marvel.cache.stale_days' => 180,
        ]);
        Http::preventStrayRequests();
        Http::fake(['marvel.test/*' => Http::response(['data' => [
            'results' => [['id' => 1, 'name' => 'Example Hero']],
            'total' => 1,
        ]])]);
    }

    #[DataProvider('invalidTimeouts')]
    public function test_it_rejects_nonpositive_timeouts_without_spending_budget(int $timeout): void
    {
        config(['marvel.timeout_seconds' => $timeout]);

        $this->getJson('/api/v1/characters')
            ->assertStatus(502)
            ->assertHeader('Content-Type', 'application/problem+json')
            ->assertJsonPath('code', 'upstream-unavailable')
            ->assertJsonPath('detail', 'The catalog source is temporarily unavailable.');
        Http::assertNothingSent();

        config(['marvel.timeout_seconds' => 1]);
        $this->getJson('/api/v1/characters')->assertOk();
        Http::assertSentCount(1);
    }

    public static function invalidTimeouts(): array
    {
        return ['zero' => [0], 'negative' => [-1]];
    }

    #[DataProvider('cacheAges')]
    public function test_it_preserves_valid_cache_when_the_timeout_becomes_invalid(int $days, int $status): void
    {
        $this->getJson('/api/v1/characters')->assertOk();
        $this->travel($days)->days();
        config(['marvel.timeout_seconds' => 0]);

        $response = $this->getJson('/api/v1/characters')->assertStatus($status);
        if ($status === 200) {
            $response->assertJsonPath('data.0.name', 'Example Hero');
        } else {
            $response->assertJsonPath('code', 'upstream-unavailable');
        }
        Http::assertSentCount(1);
    }

    public static function cacheAges(): array
    {
        return [
            'fresh' => [0, 200],
            'stale' => [31, 200],
            'expired' => [181, 502],
        ];
    }

    public function test_it_rejects_an_invalid_timeout_for_related_resources(): void
    {
        config(['marvel.timeout_seconds' => 0]);

        foreach (['/api/v1/characters/1', '/api/v1/characters/1/stories', '/api/v1/stories/1/comics'] as $path) {
            $this->getJson($path)->assertStatus(502)->assertJsonPath('code', 'upstream-unavailable');
        }
        Http::assertNothingSent();
    }
}
