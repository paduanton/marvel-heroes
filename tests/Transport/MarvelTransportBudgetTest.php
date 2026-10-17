<?php

namespace Tests\Transport;

use Illuminate\Support\Facades\Log;
use Monolog\Formatter\LineFormatter;
use Monolog\Handler\TestHandler;
use Tests\Support\MarvelTransportTestCase;

class MarvelTransportBudgetTest extends MarvelTransportTestCase
{
    public function test_a_real_read_timeout_retries_once_and_charges_both_attempts(): void
    {
        config(['marvel.daily_budget' => 2]);
        $this->source('slow_once');
        $this->getJson('/api/v1/characters')->assertOk()->assertJsonPath('data.0.name', 'Transport Hero');
        self::assertCount(2, $this->calls());
        self::assertSame([true, true], array_column($this->calls(), 'signature_valid'));
        $this->getJson('/api/v1/characters')->assertOk()->assertJsonPath('meta.cache.state', 'fresh');
        $this->getJson('/api/v1/characters/1')->assertStatus(503)->assertJsonPath('code', 'upstream-budget-exhausted');
        self::assertCount(2, $this->calls());
    }

    public function test_repeated_timeouts_exhaust_attempts_and_release_the_refresh_lock(): void
    {
        config(['marvel.daily_budget' => 2]);
        $this->source('slow');
        $started = hrtime(true);
        $this->getJson('/api/v1/characters')->assertStatus(502)
            ->assertJsonPath('code', 'upstream-unavailable')->assertHeaderMissing('ETag');
        $elapsed = (hrtime(true) - $started) / 1e9;
        self::assertGreaterThanOrEqual(2, $elapsed, 'Both one-second read windows must expire.');
        self::assertLessThan(8, $elapsed, 'A generous watchdog detects an unbounded local wait, not a latency SLA.');
        self::assertCount(2, $this->calls());
        $this->getJson('/api/v1/characters')->assertStatus(503)->assertJsonPath('code', 'upstream-budget-exhausted');
        self::assertCount(2, $this->calls());
        $this->awaitCompletedCalls(2);
        $this->source('healthy');
        $this->travel(1)->days();
        $this->getJson('/api/v1/characters')->assertOk()->assertJsonPath('meta.cache.state', 'fresh');
        self::assertCount(3, $this->calls());
    }

    public function test_a_timeout_cannot_dispatch_a_retry_after_the_budget_is_spent(): void
    {
        config(['marvel.daily_budget' => 1]);
        $this->source('slow');
        $this->getJson('/api/v1/characters')->assertStatus(503)
            ->assertJsonPath('code', 'upstream-budget-exhausted')->assertHeaderMissing('ETag');
        $this->getJson('/api/v1/characters?query=other')->assertStatus(503);
        self::assertCount(1, $this->calls());
    }

    public function test_stale_data_survives_a_timed_out_refresh_with_no_retry_budget(): void
    {
        $fresh = $this->getJson('/api/v1/characters')->assertOk();
        $this->travel(31)->days();
        config(['marvel.daily_budget' => 1]);
        $this->source('slow');
        $stale = $this->getJson('/api/v1/characters')->assertOk()->assertJsonPath('meta.cache.state', 'stale');
        self::assertSame($fresh->json('data'), $stale->json('data'));
        self::assertCount(2, $this->calls());
        $this->getJson('/api/v1/characters?query=other')->assertStatus(503)->assertJsonPath('code', 'upstream-budget-exhausted');
        self::assertCount(2, $this->calls());
        $this->awaitCompletedCalls(2);
        $this->source('healthy');
        $this->travel(1)->days();
        $this->getJson('/api/v1/characters')->assertOk()->assertJsonPath('meta.cache.state', 'fresh');
        self::assertCount(3, $this->calls());
    }

    public function test_connection_refusal_is_bounded_budgeted_and_safely_logged(): void
    {
        config([
            'marvel.daily_budget' => 2, 'logging.default' => 'capture',
            'logging.channels.capture' => ['driver' => 'monolog', 'handler' => TestHandler::class],
        ]);
        $handler = Log::channel('capture')->getLogger()->getHandlers()[0];
        $this->server->stop(0.2);
        $response = $this->getJson('/api/v1/characters?query=synthetic-search')->assertStatus(502)
            ->assertJsonPath('code', 'upstream-unavailable')->assertHeaderMissing('ETag');
        $records = $handler->getRecords();
        $used = array_values(array_filter($records, fn ($record) => $record->message === 'marvel.upstream_budget_used'));
        self::assertSame([1, 2], array_map(fn ($record) => $record->context['used'], $used));
        $formatter = new LineFormatter(includeStacktraces: true);
        $logs = implode('', array_map($formatter->format(...), $records));
        self::assertStringContainsString('marvel.upstream_connection_failed', $logs);
        self::assertStringContainsString($response->headers->get('X-Request-ID'), $logs);
        foreach (['transport-public', 'transport-private', 'apikey=', 'hash=', 'synthetic-search'] as $privateValue) {
            self::assertStringNotContainsString($privateValue, $logs.$response->getContent());
        }
        $this->getJson('/api/v1/characters')->assertStatus(503)->assertJsonPath('code', 'upstream-budget-exhausted');
        self::assertSame([], $this->calls());
    }
}
