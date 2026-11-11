<?php

namespace Tests\Feature\Api;

use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class MetronCatalogApiTest extends TestCase
{
    private const BASE_URL = 'https://metron.cloud/api/';

    protected function setUp(): void
    {
        parent::setUp();
        config(['catalog.provider' => 'metron', 'catalog.metron.token' => 'synthetic-metron-token']);
        Http::preventStrayRequests();
    }

    public function test_it_caches_marvel_only_series_searches_without_exposing_upstream_images(): void
    {
        Http::fake([
            self::BASE_URL.'publisher/*' => Http::response($this->list([['id' => 42]])),
            self::BASE_URL.'issue/*' => Http::response($this->list([$this->issue()])),
        ]);

        foreach (['Spider-Man', 'spider-man'] as $query) {
            $this->getJson('/api/v1/comics?query='.$query)
                ->assertOk()->assertJsonPath('meta.source', 'live')
                ->assertJsonPath('meta.cache.state', 'fresh')->assertJsonPath('meta.total', 1)
                ->assertJsonPath('data.0.id', 2000000000021)
                ->assertJsonPath('data.0.title', 'Amazing Spider-Man #5')
                ->assertJsonPath('data.0.on_sale_at', '2024-05-22T00:00:00Z')
                ->assertJsonPath('data.0.image_url', null)
                ->assertJsonPath('data.0.description', null)
                ->assertHeader('Link', '<https://metron.cloud/>; rel="via", <https://creativecommons.org/licenses/by-sa/4.0/>; rel="license"')
                ->assertDontSee('synthetic-metron-token');
        }

        Http::assertSentCount(2);
        Http::assertSent(fn (Request $request) => $request->url() === self::BASE_URL.'publisher/?cv_id=31');
        Http::assertSent(function (Request $request): bool {
            parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);

            return str_starts_with($request->url(), self::BASE_URL.'issue/')
                && ($query['series_name'] ?? null) === 'spider-man'
                && ($query['publisher_id'] ?? null) === '42'
                && $request->hasHeader('Authorization', 'Bearer synthetic-metron-token');
        });
    }

    public function test_it_keeps_the_live_total_and_slices_across_provider_pages(): void
    {
        Http::fake([
            self::BASE_URL.'publisher/*' => Http::response($this->list([['id' => 42]])),
            self::BASE_URL.'issue/*' => function (Request $request) {
                parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);

                return Http::response(($query['page'] ?? null) === '1'
                    ? $this->list(array_map($this->issue(...), range(1, 100)), 102, 'https://untrusted.example.invalid/')
                    : $this->list(array_map($this->issue(...), [101, 102]), 102));
            },
        ]);

        $this->getJson('/api/v1/comics?page=2&per_page=99&source=live')
            ->assertOk()->assertJsonPath('meta.total', 102)
            ->assertJsonPath('meta.source', 'live')
            ->assertJsonPath('data.*.id', [2000000000100, 2000000000101, 2000000000102]);
        $this->getJson('/api/v1/comics?page=9007199254740991&per_page=100')
            ->assertOk()->assertJsonPath('meta.total', 102)->assertJsonPath('data', []);
        Http::assertSentCount(3);
    }

    public function test_it_only_serves_live_details_from_the_verified_publisher(): void
    {
        $detail = $this->issue();
        unset($detail['issue']);
        $detail['publisher'] = ['id' => 42];
        $detail['series']['year_began'] = 2024;
        $foreignIssue = array_replace($detail, ['id' => 22, 'publisher' => ['id' => 55]]);
        Http::fake([
            self::BASE_URL.'publisher/*' => Http::response($this->list([['id' => 42]])),
            self::BASE_URL.'issue/21/' => Http::response($detail),
            self::BASE_URL.'issue/22/' => Http::response($foreignIssue),
        ]);

        $this->getJson('/api/v1/comics/2000000000021')->assertOk()
            ->assertJsonPath('data.id', 2000000000021)
            ->assertJsonPath('data.title', 'Amazing Spider-Man (2024) #5')
            ->assertJsonPath('data.image_url', null)->assertJsonPath('meta.source', 'live');
        $this->getJson('/api/v1/comics/2000000000022')->assertNotFound();
        $this->getJson('/api/v1/comics/3000001570001')->assertOk()->assertJsonPath('meta.source', 'local');
        $this->getJson('/api/v1/comics/21')->assertNotFound();
        Http::assertSentCount(3);
    }

    public function test_it_keeps_successful_empty_searches_distinct_from_an_outage(): void
    {
        Http::fake([
            self::BASE_URL.'publisher/*' => Http::response($this->list([['id' => 42]])),
            self::BASE_URL.'issue/*' => Http::sequence()
                ->push($this->list([]))
                ->push($this->list([]))
                ->push(['detail' => 'private upstream details'], 503)
                ->push(null, 302, ['Location' => 'https://untrusted.example.invalid/']),
        ]);

        $this->getJson('/api/v1/comics?query=spider-man')->assertOk()
            ->assertJsonPath('meta.source', 'local')->assertJsonPath('meta.total', 10);
        $this->getJson('/api/v1/comics?query=spider-man&source=live')->assertOk()
            ->assertJsonPath('meta.source', 'live')->assertJsonPath('data', []);
        $this->getJson('/api/v1/comics?query=no-such-series')->assertOk()->assertJsonPath('data', []);
        $this->getJson('/api/v1/comics?query=unknown-and-offline')->assertStatus(502)
            ->assertJsonPath('code', 'upstream-unavailable')->assertDontSee('private upstream details');
        $this->getJson('/api/v1/comics?query=spider-man&page=2&source=live')->assertOk()
            ->assertJsonPath('meta.source', 'live')->assertJsonPath('meta.total', 0);
        $this->getJson('/api/v1/comics?query=daredevil&page=2&source=live')->assertStatus(502);
        Http::assertSentCount(5);
    }

    public function test_it_serves_stale_before_fallback_and_recovers_when_the_provider_returns(): void
    {
        Http::fake([
            self::BASE_URL.'publisher/*' => Http::response($this->list([['id' => 42]])),
            self::BASE_URL.'issue/*' => Http::sequence()
                ->push($this->list([$this->issue()]))
                ->push(['detail' => 'synthetic outage'], 503)
                ->push($this->list([$this->issue(23)])),
        ]);

        $this->getJson('/api/v1/comics?query=spider-man')->assertOk()->assertJsonPath('meta.cache.state', 'fresh');
        $this->travel(31)->days();
        $this->getJson('/api/v1/comics?query=spider-man')->assertOk()
            ->assertJsonPath('meta.source', 'live')->assertJsonPath('meta.cache.state', 'stale')
            ->assertJsonPath('data.0.id', 2000000000021);
        $this->getJson('/api/v1/comics?query=spider-man')->assertOk()
            ->assertJsonPath('meta.source', 'live')->assertJsonPath('meta.cache.state', 'fresh')
            ->assertJsonPath('data.0.id', 2000000000023);
        Http::assertSentCount(5);
    }

    public function test_it_shares_provider_cooldown_across_distinct_searches_without_retrying(): void
    {
        Http::fake([
            self::BASE_URL.'publisher/*' => Http::response($this->list([['id' => 42]])),
            self::BASE_URL.'issue/*' => Http::sequence()
                ->push(['detail' => 'rate limited'], 429, ['Retry-After' => '90'])
                ->push($this->list([$this->issue()])),
        ]);

        $this->getJson('/api/v1/comics?query=spider-man')->assertOk()->assertJsonPath('meta.source', 'local');
        $this->travel(60)->seconds();
        $this->getJson('/api/v1/comics?query=daredevil&source=live')->assertServiceUnavailable()
            ->assertJsonPath('code', 'upstream-budget-exhausted');
        $this->getJson('/api/v1/comics?query=no-such-series')->assertServiceUnavailable();
        Http::assertSentCount(2);

        $this->travel(31)->seconds();
        $this->getJson('/api/v1/comics?query=spider-man')->assertOk()->assertJsonPath('meta.source', 'live');
        Http::assertSentCount(3);
    }

    public function test_it_does_not_consume_upstream_budget_for_readiness_or_local_discovery(): void
    {
        Http::fake();

        $this->getJson('/ready')->assertOk();
        $this->getJson('/api/v1/comics?source=local')->assertOk()->assertJsonPath('meta.source', 'local');
        $this->getJson('/api/v1/characters?query=spi')->assertOk()->assertJsonPath('meta.source', 'local');
        $this->getJson('/api/v1/characters?query=spi&source=live')->assertServiceUnavailable();
        config(['catalog.metron.token' => null]);
        $this->getJson('/ready')->assertServiceUnavailable();
        $this->getJson('/api/v1/comics?source=live')->assertServiceUnavailable();
        $this->getJson('/api/v1/comics')->assertOk()->assertJsonPath('meta.source', 'local');
        Http::assertNothingSent();
    }

    public function test_it_caps_distinct_requests_in_both_rolling_windows(): void
    {
        config(['catalog.metron.requests_per_minute' => 2, 'catalog.metron.requests_per_day' => 3]);
        Http::fake([
            self::BASE_URL.'publisher/*' => Http::response($this->list([['id' => 42]])),
            self::BASE_URL.'issue/*' => Http::response($this->list([$this->issue()])),
        ]);

        $this->getJson('/api/v1/comics?query=spider-man&source=live')->assertOk();
        $this->getJson('/api/v1/comics?query=daredevil&source=live')->assertServiceUnavailable();
        $this->getJson('/api/v1/comics?query=spider-man&source=live')->assertOk();
        Http::assertSentCount(2);

        $this->travel(61)->seconds();
        $this->getJson('/api/v1/comics?query=daredevil&source=live')->assertOk();
        $this->travel(61)->seconds();
        $this->getJson('/api/v1/comics?query=iron+man&source=live')->assertServiceUnavailable();
        Http::assertSentCount(3);

        $this->travel(1)->day();
        $this->getJson('/api/v1/comics?query=iron+man&source=live')->assertOk();
        Http::assertSentCount(4);
    }

    public function test_it_uses_the_provider_reset_header_before_the_first_429(): void
    {
        Http::fake([
            self::BASE_URL.'publisher/*' => Http::response($this->list([['id' => 42]])),
            self::BASE_URL.'issue/*' => Http::sequence()
                ->push($this->list([$this->issue()]), 200, [
                    'X-RateLimit-Sustained-Remaining' => '0',
                    'X-RateLimit-Sustained-Reset' => (string) (now()->timestamp + 120),
                ])
                ->push($this->list([$this->issue()])),
        ]);

        $this->getJson('/api/v1/comics?query=spider-man')->assertOk()->assertJsonPath('meta.source', 'live');
        $this->getJson('/api/v1/comics?query=daredevil')->assertOk()->assertJsonPath('meta.source', 'local');
        Http::assertSentCount(2);
        $this->travel(121)->seconds();
        $this->getJson('/api/v1/comics?query=daredevil')->assertOk()->assertJsonPath('meta.source', 'live');
        Http::assertSentCount(3);
    }

    public function test_it_does_not_cache_malformed_or_oversized_issue_ids(): void
    {
        Http::fake([
            self::BASE_URL.'publisher/*' => Http::response($this->list([['id' => 42]])),
            self::BASE_URL.'issue/*' => Http::sequence()
                ->push('not json')
                ->push($this->list([$this->issue(1000000000000)]))
                ->push($this->list([$this->issue()])),
        ]);

        $this->getJson('/api/v1/comics?source=live')->assertStatus(502);
        $this->getJson('/api/v1/comics?source=live')->assertStatus(502);
        $this->getJson('/api/v1/comics?source=live')->assertOk()->assertJsonPath('data.0.id', 2000000000021);
        Http::assertSentCount(4);
    }

    public function test_it_queries_live_appearances_only_after_an_exact_character_cross_reference(): void
    {
        Http::fake([
            self::BASE_URL.'character/?gcd_id=6122' => Http::response($this->list([['id' => 35]])),
            self::BASE_URL.'character/?gcd_id=6413' => Http::response($this->list([['id' => 36], ['id' => 37]])),
            self::BASE_URL.'publisher/?cv_id=31' => Http::response($this->list([['id' => 42]])),
            self::BASE_URL.'issue/*' => Http::response($this->list([$this->issue()])),
        ]);

        $this->getJson('/api/v1/characters/3000000006122/comics')->assertOk()
            ->assertJsonPath('meta.source', 'live')->assertJsonPath('data.0.id', 2000000000021);
        $this->getJson('/api/v1/characters/3000000006122/comics?source=live&page=2')->assertOk()
            ->assertJsonPath('meta.source', 'live')->assertJsonPath('meta.total', 1)->assertJsonPath('data', []);
        $this->getJson('/api/v1/characters/3000000006122/comics?source=local')->assertOk()
            ->assertJsonPath('meta.source', 'local')->assertJsonPath('data.0.id', 3000001570001);
        $this->getJson('/api/v1/characters/3000000006413/comics')->assertOk()->assertJsonPath('meta.source', 'local');
        $this->getJson('/api/v1/characters/3000000006413/comics?source=live')->assertOk()
            ->assertJsonPath('meta.source', 'live')->assertJsonPath('data', []);
        $this->getJson('/api/v1/characters/35/comics')->assertNotFound();
        $this->getJson('/api/v1/characters/3000000006122/comics?source=other')->assertUnprocessable();

        Http::assertSentCount(4);
        Http::assertSent(function (Request $request): bool {
            parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);

            return ($query['character_id'] ?? null) === '35' && ($query['publisher_id'] ?? null) === '42';
        });
    }

    private function list(array $results, ?int $count = null, ?string $next = null): array
    {
        return ['results' => $results, 'count' => $count ?? count($results), 'next' => $next, 'previous' => null];
    }

    private function issue(int $id = 21): array
    {
        return [
            'id' => $id,
            'series' => ['id' => 7, 'name' => 'Amazing Spider-Man'],
            'issue' => 'Amazing Spider-Man #5',
            'number' => '5',
            'store_date' => '2024-05-22',
            'image' => 'https://covers.example.invalid/synthetic.jpg',
            'desc' => 'Synthetic third-party description',
        ];
    }
}
