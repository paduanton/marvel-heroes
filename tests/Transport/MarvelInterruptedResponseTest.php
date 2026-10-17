<?php

namespace Tests\Transport;

use Illuminate\Support\Facades\Log;
use Monolog\Formatter\LineFormatter;
use Monolog\Handler\TestHandler;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\MarvelTransportTestCase;

class MarvelInterruptedResponseTest extends MarvelTransportTestCase
{
    #[DataProvider('transferStatuses')]
    public function test_an_incomplete_http_transfer_is_not_cached_as_a_success(int $status, int $attempts): void
    {
        config(['marvel.daily_budget' => $attempts]);
        $this->source('truncated', ['status' => $status]);
        $response = $this->getJson('/api/v1/characters');
        self::assertSame(502, $response->status(), 'An interrupted upstream error must use the safe upstream problem response.');
        $response->assertJsonPath('code', 'upstream-unavailable')->assertHeaderMissing('ETag');
        self::assertCount($attempts, $this->calls());
        $this->source('healthy');
        $this->getJson('/api/v1/characters')->assertStatus(503)->assertJsonPath('code', 'upstream-budget-exhausted');
        $this->travel(1)->days();
        $this->getJson('/api/v1/characters')->assertOk()->assertJsonPath('meta.cache.state', 'fresh');
        $this->getJson('/api/v1/characters')->assertOk();
        self::assertCount($attempts + 1, $this->calls());
    }

    #[DataProvider('catalogResources')]
    public function test_incomplete_error_responses_preserve_stale_data_without_renewing_it(string $path, string $labelPath, string $label): void
    {
        $fresh = $this->getJson($path)->assertOk()->assertJsonPath($labelPath, $label);
        $this->travel(31)->days();
        $this->source('truncated', ['status' => 503]);
        $stale = $this->getJson($path)->assertOk()->assertJsonPath('meta.cache.state', 'stale');
        self::assertSame($fresh->json('data'), $stale->json('data'));
        self::assertCount(2, $this->calls());
        $this->getJson($path)->assertOk()->assertJsonPath('meta.cache.state', 'stale');
        self::assertCount(3, $this->calls());
        $this->travel(150)->days();
        $this->getJson($path)->assertStatus(502)->assertJsonPath('code', 'upstream-unavailable');
        self::assertCount(4, $this->calls());
        $this->source('healthy');
        $this->getJson($path)->assertOk()->assertJsonPath('meta.cache.state', 'fresh');
        $this->getJson($path)->assertOk();
        self::assertCount(5, $this->calls());
    }

    public function test_incomplete_error_responses_do_not_expose_transport_or_payload_diagnostics(): void
    {
        config([
            'logging.default' => 'capture',
            'logging.channels.capture' => ['driver' => 'monolog', 'handler' => TestHandler::class],
        ]);
        $handler = Log::channel('capture')->getLogger()->getHandlers()[0];
        $this->source('truncated', [
            'status' => 503,
            'body' => '{"message":"Transport-only diagnostic with transport-public and transport-private"}',
        ]);
        $response = $this->getJson('/api/v1/characters?query=synthetic-search')->assertStatus(502)
            ->assertHeader('Content-Type', 'application/problem+json')->assertHeaderMissing('ETag')
            ->assertJsonPath('code', 'upstream-unavailable');
        self::assertCount(1, $this->calls());
        $formatter = new LineFormatter(includeStacktraces: true);
        $logs = implode('', array_map($formatter->format(...), $handler->getRecords()));
        self::assertStringContainsString('marvel.upstream_failed', $logs);
        self::assertStringContainsString($response->headers->get('X-Request-ID'), $logs);
        foreach (['transport-public', 'transport-private', 'Transport-only diagnostic', 'apikey=', 'hash=', 'synthetic-search'] as $privateValue) {
            self::assertFalse(str_contains($logs.$response->getContent(), $privateValue), 'Response and logs must not contain upstream diagnostics.');
        }
    }

    public static function transferStatuses(): array
    {
        return [
            'successful status with incomplete body' => [200, 2],
            'rate-limited status with incomplete body' => [429, 1],
            'server error status with incomplete body' => [500, 1],
            'failure status with incomplete body' => [503, 1],
        ];
    }
}
