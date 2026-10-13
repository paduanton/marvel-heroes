<?php

namespace Tests\Feature\Console;

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class WarmMarvelCacheTest extends TestCase
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
            'marvel.warm_queries' => ['spider-man', 'iron man'],
        ]);
        Http::preventStrayRequests();
        Http::fake(['marvel.test/*' => Http::response([
            'data' => ['results' => [['id' => 1, 'name' => 'Example Hero']], 'total' => 40],
        ])]);
    }

    public function test_an_explicit_empty_query_warms_the_initial_catalog_instead_of_configured_searches(): void
    {
        $this->artisan('marvel:cache:warm --query=')
            ->expectsOutputToContain('Warmed initial character catalog.')
            ->assertSuccessful();

        Http::assertSentCount(1);
        Http::assertSent(function (Request $request): bool {
            parse_str(parse_url($request->url(), PHP_URL_QUERY) ?? '', $query);

            return ! array_key_exists('nameStartsWith', $query)
                && $query['limit'] === '20' && $query['orderBy'] === 'name';
        });
        $this->getJson('/api/v1/characters')->assertOk()
            ->assertJsonPath('data.0.name', 'Example Hero')
            ->assertJsonPath('meta.page', 1)
            ->assertJsonPath('meta.per_page', 20)
            ->assertJsonPath('meta.cache.state', 'fresh');
        Http::assertSentCount(1);
    }

    public function test_without_overrides_it_only_warms_the_configured_searches(): void
    {
        $this->artisan('marvel:cache:warm')->assertSuccessful();

        Http::assertSentCount(2);
        Http::assertSent(fn (Request $request) => $request['nameStartsWith'] === 'spider-man');
        Http::assertSent(fn (Request $request) => $request['nameStartsWith'] === 'iron man');
    }

    public function test_without_configured_queries_or_overrides_it_makes_no_upstream_calls(): void
    {
        config(['marvel.warm_queries' => []]);

        $this->artisan('marvel:cache:warm')->assertSuccessful();

        Http::assertNothingSent();
    }

    public function test_repeated_empty_and_named_overrides_do_not_warm_the_defaults_or_duplicate_upstream_calls(): void
    {
        $this->artisan('marvel:cache:warm --query= --query=sp --query= --query=sp')->assertSuccessful();

        Http::assertSentCount(2);
        Http::assertSent(fn (Request $request) => ! array_key_exists('nameStartsWith', $request->data()));
        Http::assertSent(fn (Request $request) => ($request['nameStartsWith'] ?? null) === 'sp');
        $this->getJson('/api/v1/characters')->assertOk();
        $this->getJson('/api/v1/characters?query=sp')->assertOk();
        Http::assertSentCount(2);
    }

    public function test_explicit_warmup_reuses_fresh_cache_even_when_no_upstream_budget_remains(): void
    {
        $this->getJson('/api/v1/characters')->assertOk();
        config(['marvel.daily_budget' => 0]);

        $this->artisan('marvel:cache:warm --query=')->assertSuccessful();

        $this->getJson('/api/v1/characters')->assertOk()->assertJsonPath('meta.cache.state', 'fresh');
        Http::assertSentCount(1);
    }

    public function test_explicit_catalog_warmup_does_not_preload_other_pages(): void
    {
        $this->artisan('marvel:cache:warm --query=')->assertSuccessful();
        Http::assertSentCount(1);
        $this->getJson('/api/v1/characters')->assertOk()->assertJsonPath('meta.total', 40);
        Http::assertSentCount(1);

        $this->getJson('/api/v1/characters?page=2')->assertOk()->assertJsonPath('meta.page', 2);
        Http::assertSentCount(2);
        Http::assertSent(function (Request $request): bool {
            parse_str(parse_url($request->url(), PHP_URL_QUERY) ?? '', $query);

            return ($query['offset'] ?? null) === '20' && $query['limit'] === '20';
        });
    }
}
