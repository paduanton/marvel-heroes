<?php

namespace Tests\Feature\Console;

use Illuminate\Http\Client\Factory;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
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

    #[DataProvider('invalidQueries')]
    public function test_all_queries_are_validated_before_any_budget_is_spent(mixed $invalid): void
    {
        config(['marvel.warm_queries' => ['spider-man', $invalid]]);

        $this->artisan('marvel:cache:warm')->expectsOutputToContain('No requests were made.')->assertExitCode(2);

        Http::assertNothingSent();
        self::assertNull(Cache::get('marvel:budget:timestamps'));
    }

    public static function invalidQueries(): array
    {
        return [
            'one character' => ['x'], 'numeric zero' => ['0'],
            'too long' => [str_repeat('a', 101)], 'array' => [['spider']],
            'integer' => [12], 'null' => [null], 'boolean' => [false],
        ];
    }

    public function test_dry_run_previews_normalized_unique_queries_without_credentials_or_budget(): void
    {
        config(['marvel.public_key' => '', 'marvel.private_key' => '', 'marvel.daily_budget' => 0]);

        $this->artisan('marvel:cache:warm', ['--query' => [' SPIDER-MAN ', 'spider-man', '', ' '], '--dry-run' => true])
            ->expectsOutputToContain('Planned character query: spider-man')
            ->expectsOutputToContain('Planned initial character catalog.')
            ->expectsOutputToContain('Dry run: 2 unique queries; no upstream requests or cache changes.')
            ->assertSuccessful();

        Http::assertNothingSent();
        self::assertNull(Cache::get('marvel:budget:timestamps'));
    }

    public function test_normalization_deduplicates_output_and_requests(): void
    {
        $this->withoutMockingConsoleOutput();
        self::assertSame(0, Artisan::call('marvel:cache:warm', ['--query' => [' SPIDER-MAN ', 'spider-man', 'SPIDER-MAN', '', ' ']]));
        $output = Artisan::output();
        self::assertSame(1, substr_count($output, 'Warmed character query: spider-man'));
        self::assertSame(1, substr_count($output, 'Warmed initial character catalog.'));
        Http::assertSentCount(2);
    }

    public function test_dry_run_does_not_populate_catalog_cache(): void
    {
        config(['marvel.daily_budget' => 1]);
        $this->artisan('marvel:cache:warm --query=sp --dry-run')->assertSuccessful();
        Http::assertNothingSent();
        $this->getJson('/api/v1/characters?query=sp')->assertOk();
        Http::assertSentCount(1);
    }

    public function test_invalid_explicit_queries_also_fail_in_dry_run(): void
    {
        $this->artisan('marvel:cache:warm --query=x --dry-run')->assertExitCode(2);
        Http::assertNothingSent();
    }

    public function test_invalid_configured_query_list_is_rejected_without_a_type_error(): void
    {
        config(['marvel.warm_queries' => 'not-a-list']);
        $this->artisan('marvel:cache:warm')->assertExitCode(2);
        Http::assertNothingSent();
    }

    public function test_stale_fallback_is_reported_without_claiming_a_refresh(): void
    {
        $this->getJson('/api/v1/characters?query=sp')->assertOk();
        $this->travel(31)->days();
        $this->getJson('/api/v1/characters?query=iron')->assertOk();
        config(['marvel.daily_budget' => 0]);
        $this->withoutMockingConsoleOutput();

        self::assertSame(0, Artisan::call('marvel:cache:warm', ['--query' => ['sp', 'iron']]));
        $output = Artisan::output();
        self::assertStringContainsString('Stale cache kept for character query: sp', $output);
        self::assertStringNotContainsString('Warmed character query: sp', $output);
        self::assertStringContainsString('Warmup finished: 1 fresh, 1 stale, 0 failed.', $output);
        Http::assertSentCount(2);
    }

    public function test_a_failed_query_does_not_hide_later_successes_or_print_upstream_diagnostics(): void
    {
        Http::swap(new Factory);
        Http::preventStrayRequests();
        Http::fake(['marvel.test/*' => fn (Request $request) => $request['nameStartsWith'] === 'sp'
            ? Http::response(['message' => 'Private upstream diagnostic'], 503)
            : Http::response(['data' => ['results' => [['id' => 2, 'name' => 'Iron Man']], 'total' => 1]])]);
        $this->withoutMockingConsoleOutput();

        self::assertSame(1, Artisan::call('marvel:cache:warm', ['--query' => ['sp', 'iron']]));
        $output = Artisan::output();
        self::assertStringContainsString('Could not warm character query: sp (upstream-unavailable).', $output);
        self::assertStringContainsString('Warmed character query: iron', $output);
        self::assertStringContainsString('Warmup finished: 1 fresh, 0 stale, 1 failed.', $output);
        self::assertStringNotContainsString('Private upstream diagnostic', $output);
        Http::assertSentCount(2);
    }

    public function test_exhausted_budget_still_allows_a_later_fresh_cached_query(): void
    {
        $this->getJson('/api/v1/characters?query=iron')->assertOk();
        config(['marvel.daily_budget' => 0]);
        $this->withoutMockingConsoleOutput();

        self::assertSame(1, Artisan::call('marvel:cache:warm', ['--query' => ['missing', 'iron']]));
        $output = Artisan::output();
        self::assertStringContainsString('upstream-budget-exhausted', $output);
        self::assertStringContainsString('Warmup finished: 1 fresh, 0 stale, 1 failed.', $output);
        Http::assertSentCount(1);
    }
}
