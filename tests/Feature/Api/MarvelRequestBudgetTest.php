<?php

namespace Tests\Feature\Api;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class MarvelRequestBudgetTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        config([
            'marvel.base_url' => 'https://marvel.test/v1/public',
            'marvel.public_key' => 'test-public',
            'marvel.private_key' => 'test-private',
            'marvel.retry_times' => 2,
            'marvel.daily_budget' => 1,
            'marvel.cache.fresh_days' => 30,
            'marvel.cache.stale_days' => 180,
        ]);
        Http::preventStrayRequests();
    }

    public function test_it_blocks_a_retry_when_the_first_attempt_exhausts_the_budget(): void
    {
        $attempts = 0;
        Http::fake(function () use (&$attempts) {
            $attempts++;

            return $attempts === 1
                ? Http::failedConnection()
                : Http::response(['data' => ['results' => [], 'total' => 0]]);
        });

        $this->getJson('/api/v1/characters')
            ->assertStatus(503)
            ->assertJsonPath('code', 'upstream-budget-exhausted');

        self::assertSame(1, $attempts);
    }

    public function test_it_counts_a_successful_retry_against_the_shared_budget(): void
    {
        config(['marvel.daily_budget' => 2]);
        $attempts = 0;
        Http::fake(function () use (&$attempts) {
            $attempts++;

            return $attempts === 1
                ? Http::failedConnection()
                : Http::response(['data' => ['results' => [], 'total' => 0]]);
        });

        $this->getJson('/api/v1/characters')->assertOk();
        $this->getJson('/api/v1/characters?query=other')
            ->assertStatus(503)
            ->assertJsonPath('code', 'upstream-budget-exhausted');

        self::assertSame(2, $attempts);
    }

    public function test_it_serves_fresh_cache_without_consuming_another_attempt(): void
    {
        Http::fake(['marvel.test/*' => Http::response(['data' => ['results' => [], 'total' => 0]])]);

        $this->getJson('/api/v1/characters')->assertOk();
        $this->getJson('/api/v1/characters')->assertOk();
        $this->getJson('/api/v1/characters?query=other')->assertStatus(503);

        Http::assertSentCount(1);
    }

    public function test_it_preserves_stale_data_when_a_refresh_retry_has_no_budget(): void
    {
        $attempts = 0;
        Http::fake(function () use (&$attempts) {
            $attempts++;

            return $attempts === 1
                ? Http::response(['data' => ['results' => [['id' => 1, 'name' => 'Example Hero']], 'total' => 1]])
                : Http::failedConnection();
        });

        $this->getJson('/api/v1/characters')->assertOk()->assertJsonPath('data.0.name', 'Example Hero');
        $this->travel(31)->days();
        $this->getJson('/api/v1/characters')->assertOk()->assertJsonPath('data.0.name', 'Example Hero');
        $this->getJson('/api/v1/characters?query=other')->assertStatus(503);

        self::assertSame(2, $attempts);
    }

    public function test_it_uses_a_rolling_day_instead_of_resetting_at_midnight(): void
    {
        $start = CarbonImmutable::parse('2026-01-01T23:59:30Z');
        $this->travelTo($start);
        Http::fake(['marvel.test/*' => Http::response(['data' => ['results' => [], 'total' => 0]])]);

        $this->getJson('/api/v1/characters')->assertOk();
        $this->travelTo($start->addMinute());
        $this->getJson('/api/v1/characters?query=other')->assertStatus(503);
        $this->travelTo($start->addDay()->subSecond());
        $this->getJson('/api/v1/characters?query=other')->assertStatus(503);
        $this->travelTo($start->addDay());
        $this->getJson('/api/v1/characters?query=other')->assertOk();

        Http::assertSentCount(2);
    }

    public function test_it_shares_the_budget_across_catalog_resources(): void
    {
        Http::fake(['marvel.test/*' => Http::response(['data' => ['results' => [], 'total' => 0]])]);
        $this->getJson('/api/v1/characters')->assertOk();

        foreach (['/api/v1/characters/999', '/api/v1/characters/999/stories', '/api/v1/stories/999/comics'] as $path) {
            $this->getJson($path)->assertStatus(503)->assertJsonPath('code', 'upstream-budget-exhausted');
        }

        Http::assertSentCount(1);
    }

    public function test_it_counts_an_unsuccessful_http_response_as_an_attempt(): void
    {
        Http::fake(['marvel.test/*' => Http::response([], 500)]);

        $this->getJson('/api/v1/characters')->assertStatus(502);
        $this->getJson('/api/v1/characters')->assertStatus(503)->assertJsonPath('code', 'upstream-budget-exhausted');

        Http::assertSentCount(1);
    }

    public function test_it_does_not_reserve_budget_when_credentials_are_missing(): void
    {
        Http::fake(['marvel.test/*' => Http::response(['data' => ['results' => [], 'total' => 0]])]);
        config(['marvel.private_key' => '']);
        $this->getJson('/api/v1/characters')->assertStatus(502);
        Http::assertNothingSent();

        config(['marvel.private_key' => 'test-private']);
        $this->getJson('/api/v1/characters')->assertOk();
        Http::assertSentCount(1);
    }

    public function test_it_blocks_all_attempts_when_the_budget_is_zero(): void
    {
        config(['marvel.daily_budget' => 0]);
        Http::fake();

        $this->getJson('/api/v1/characters')->assertStatus(503)->assertJsonPath('code', 'upstream-budget-exhausted');

        Http::assertNothingSent();
    }
}
