<?php

namespace Tests\Feature\Api;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class CatalogCacheStateTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        config([
            'marvel.base_url' => 'https://marvel.test/v1/public',
            'marvel.public_key' => 'test-public',
            'marvel.private_key' => 'test-private',
            'marvel.daily_budget' => 10,
            'marvel.cache.fresh_days' => 30,
            'marvel.cache.stale_days' => 180,
        ]);
        Http::preventStrayRequests();
        $this->travelTo(CarbonImmutable::parse('2026-01-01T12:00:00Z'));
    }

    #[DataProvider('catalogResources')]
    public function test_responses_report_fresh_stale_and_recovery_without_changing_the_data(string $path): void
    {
        Http::fake(['marvel.test/*' => Http::sequence()->push($this->payload())->push($this->payload())]);
        $fresh = $this->getJson($path)->assertOk()->assertJsonPath('meta.cache', ['state' => 'fresh']);
        $this->getJson($path)->assertOk()->assertJsonPath('meta.cache.state', 'fresh');
        Http::assertSentCount(1);

        $this->travel(31)->days();
        config(['marvel.daily_budget' => 0]);
        $stale = $this->withHeader('If-None-Match', $fresh->headers->get('ETag'))->getJson($path)
            ->assertOk()->assertJsonPath('meta.cache', ['state' => 'stale']);
        self::assertSame($fresh->json('data'), $stale->json('data'));
        self::assertNotSame($fresh->headers->get('ETag'), $stale->headers->get('ETag'));
        $this->withHeader('If-None-Match', $stale->headers->get('ETag'))->getJson($path)->assertStatus(304);
        Http::assertSentCount(1);

        config(['marvel.daily_budget' => 10]);
        $this->getJson($path)->assertOk()->assertJsonPath('meta.cache.state', 'fresh');
        Http::assertSentCount(2);
    }

    #[DataProvider('catalogResources')]
    public function test_upstream_failure_reports_stale_until_a_successful_refresh(string $path): void
    {
        Http::fake(['marvel.test/*' => Http::sequence()
            ->push($this->payload())->push(['message' => 'Private diagnostic'], 503)->push($this->payload())]);
        $this->getJson($path)->assertOk()->assertJsonPath('meta.cache.state', 'fresh');
        $this->travel(31)->days();
        $this->getJson($path)->assertOk()->assertJsonPath('meta.cache.state', 'stale')->assertDontSee('Private diagnostic');
        $this->getJson($path)->assertOk()->assertJsonPath('meta.cache.state', 'fresh');
        Http::assertSentCount(3);
    }

    public function test_empty_cached_collections_still_report_stale(): void
    {
        Http::fake(['marvel.test/*' => Http::response(['data' => ['results' => [], 'total' => 0]])]);
        $path = '/api/v1/characters?page=2&per_page=10';
        $this->getJson($path)->assertOk()->assertJsonPath('data', [])->assertJsonPath('meta', [
            'page' => 2, 'per_page' => 10, 'total' => 0, 'cache' => ['state' => 'fresh'],
        ]);
        $this->travel(31)->days();
        config(['marvel.daily_budget' => 0]);
        $this->getJson($path)->assertOk()->assertJsonPath('data', [])->assertJsonPath('meta.cache.state', 'stale');
        Http::assertSentCount(1);
    }

    public function test_state_does_not_leak_into_another_resource_errors_or_legacy_responses(): void
    {
        Http::fake(['marvel.test/*' => Http::response($this->payload())]);
        $this->getJson('/api/v1/characters/1')->assertOk();
        $this->travel(31)->days();
        config(['marvel.daily_budget' => 0]);
        $this->getJson('/api/v1/characters/1')->assertOk()->assertJsonPath('meta.cache.state', 'stale');
        $this->getJson('/api/v1/characters?query=x')->assertStatus(422)->assertJsonMissingPath('meta.cache');
        $this->getJson('/api/v1/characters/2')->assertStatus(503)->assertJsonMissingPath('meta.cache');
        config(['marvel.daily_budget' => 10]);
        $this->getJson('/api/v1/characters/2')->assertOk()->assertJsonPath('meta.cache.state', 'fresh');
        $this->getJson('/api/character/example')->assertOk()->assertJsonMissingPath('meta.cache');
        $this->getJson('/health')->assertOk()->assertJsonMissingPath('meta.cache');
    }

    public static function catalogResources(): array
    {
        return [
            'characters' => ['/api/v1/characters'],
            'detail' => ['/api/v1/characters/1'],
            'stories' => ['/api/v1/characters/1/stories'],
            'comics' => ['/api/v1/stories/1/comics'],
        ];
    }

    private function payload(): array
    {
        return ['data' => ['results' => [['id' => 1, 'name' => 'Example Hero', 'title' => 'Example Hero']], 'total' => 1]];
    }
}
