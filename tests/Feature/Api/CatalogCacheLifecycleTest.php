<?php

namespace Tests\Feature\Api;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class CatalogCacheLifecycleTest extends TestCase
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
        $this->travelTo(CarbonImmutable::parse('2026-01-01T12:00:00Z'));
    }

    #[DataProvider('catalogResources')]
    public function test_a_successful_refresh_starts_a_new_freshness_window(string $path, string $labelPath): void
    {
        Http::fake(['marvel.test/*' => Http::sequence()
            ->push($this->payload('Original'))
            ->push($this->payload('Updated'))
            ->push($this->payload('Latest'))]);

        $this->getJson($path)->assertOk()->assertJsonPath($labelPath, 'Original');
        $this->travel(29)->days();
        $this->getJson($path)->assertOk()->assertJsonPath($labelPath, 'Original');
        Http::assertSentCount(1);

        $this->travel(2)->days();
        $this->getJson($path)->assertOk()->assertJsonPath($labelPath, 'Updated');
        $this->getJson($path)->assertOk()->assertJsonPath($labelPath, 'Updated');
        $this->travel(29)->days();
        $this->getJson($path)->assertOk()->assertJsonPath($labelPath, 'Updated');
        Http::assertSentCount(2);

        $this->travel(2)->days();
        $this->getJson($path)->assertOk()->assertJsonPath($labelPath, 'Latest');
        $this->getJson($path)->assertOk()->assertJsonPath($labelPath, 'Latest');
        Http::assertSentCount(3);
    }

    #[DataProvider('catalogResources')]
    public function test_failed_refreshes_do_not_extend_freshness_or_stale_retention(string $path, string $labelPath): void
    {
        Http::fake(['marvel.test/*' => Http::sequence()
            ->push($this->payload('Original'))
            ->push(['message' => 'Private upstream diagnostic'], 503)
            ->push(['message' => 'Private upstream diagnostic'], 503)
            ->push(['message' => 'Private upstream diagnostic'], 503)
            ->push($this->payload('Recovered'))]);

        $this->getJson($path)->assertOk()->assertJsonPath($labelPath, 'Original');
        $this->travel(31)->days();
        $this->getJson($path)->assertOk()->assertJsonPath($labelPath, 'Original');
        Http::assertSentCount(2);
        $this->travel(1)->days();
        $this->getJson($path)->assertOk()->assertJsonPath($labelPath, 'Original');
        Http::assertSentCount(3);

        $this->travel(149)->days();
        $this->getJson($path)
            ->assertStatus(502)
            ->assertHeader('Content-Type', 'application/problem+json')
            ->assertHeader('X-Request-ID')
            ->assertJsonPath('code', 'upstream-unavailable')
            ->assertDontSee('Original')
            ->assertDontSee('Private upstream diagnostic');
        Http::assertSentCount(4);

        $this->getJson($path)->assertOk()->assertJsonPath($labelPath, 'Recovered');
        $this->getJson($path)->assertOk()->assertJsonPath($labelPath, 'Recovered');
        Http::assertSentCount(5);
    }

    #[DataProvider('catalogResources')]
    public function test_an_exhausted_budget_serves_only_unexpired_cached_data(string $path, string $labelPath): void
    {
        Http::fake(['marvel.test/*' => Http::response($this->payload('Original'))]);

        $this->getJson($path)->assertOk()->assertJsonPath($labelPath, 'Original');
        config(['marvel.daily_budget' => 0]);
        $this->getJson($path)->assertOk()->assertJsonPath($labelPath, 'Original');
        $this->travel(31)->days();
        $this->getJson($path)->assertOk()->assertJsonPath($labelPath, 'Original');
        Http::assertSentCount(1);

        $this->travel(150)->days();
        $this->getJson($path)
            ->assertStatus(503)
            ->assertHeader('Content-Type', 'application/problem+json')
            ->assertJsonPath('code', 'upstream-budget-exhausted')
            ->assertDontSee('Original');
        Http::assertSentCount(1);
    }

    public function test_a_cached_missing_character_is_rechecked_after_freshness_expires(): void
    {
        Http::fake(['marvel.test/*' => Http::sequence()
            ->push(['data' => ['results' => [], 'total' => 0]])
            ->push($this->payload('Discovered'))]);

        $path = '/api/v1/characters/1';
        $this->getJson($path)->assertNotFound()->assertJsonPath('code', 'resource-not-found');
        $this->travel(29)->days();
        $this->getJson($path)->assertNotFound()->assertJsonPath('code', 'resource-not-found');
        Http::assertSentCount(1);

        $this->travel(2)->days();
        $this->getJson($path)->assertOk()->assertJsonPath('data.name', 'Discovered');
        $this->getJson($path)->assertOk()->assertJsonPath('data.name', 'Discovered');
        Http::assertSentCount(2);
    }

    public static function catalogResources(): array
    {
        return [
            'characters' => ['/api/v1/characters', 'data.0.name'],
            'character detail' => ['/api/v1/characters/1', 'data.name'],
            'stories' => ['/api/v1/characters/1/stories', 'data.0.title'],
            'comics' => ['/api/v1/stories/1/comics', 'data.0.title'],
        ];
    }

    private function payload(string $label): array
    {
        return ['data' => ['results' => [['id' => 1, 'name' => $label, 'title' => $label]], 'total' => 1]];
    }
}
