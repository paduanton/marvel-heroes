<?php

namespace Tests\Feature\Api;

use GuzzleHttp\Psr7\Response as PsrResponse;
use Illuminate\Http\Client\RequestException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Monolog\Formatter\LineFormatter;
use Monolog\Handler\TestHandler;
use Tests\TestCase;

class MarvelTransportLoggingTest extends TestCase
{
    public function test_transfer_request_exceptions_use_safe_problems_without_reporting_the_upstream_body(): void
    {
        config([
            'logging.default' => 'capture',
            'logging.channels.capture' => ['driver' => 'monolog', 'handler' => TestHandler::class],
            'marvel.public_key' => 'test-public', 'marvel.private_key' => 'test-private',
            'marvel.retry_times' => 2,
        ]);
        $handler = Log::channel('capture')->getLogger()->getHandlers()[0];
        Http::preventStrayRequests();
        $attempts = 0;
        Http::fake(function () use (&$attempts) {
            $attempts++;

            throw new RequestException(new Response(new PsrResponse(
                503, ['Content-Type' => 'application/json'],
                '{"message":"Synthetic upstream-only diagnostic"}',
            )));
        });

        $response = $this->getJson('/api/v1/characters')->assertStatus(502)
            ->assertHeader('Content-Type', 'application/problem+json')->assertHeaderMissing('ETag')
            ->assertJsonPath('code', 'upstream-unavailable');
        $formatter = new LineFormatter(includeStacktraces: true);
        $logs = implode('', array_map($formatter->format(...), $handler->getRecords()));
        self::assertStringContainsString('marvel.upstream_failed', $logs);
        self::assertStringContainsString($response->headers->get('X-Request-ID'), $logs);
        self::assertFalse(str_contains($logs.$response->getContent(), 'Synthetic upstream-only diagnostic'));
        self::assertSame(1, $attempts);
    }

    public function test_connection_failures_do_not_report_signed_transport_diagnostics(): void
    {
        config([
            'logging.default' => 'capture',
            'logging.channels.capture' => ['driver' => 'monolog', 'handler' => TestHandler::class],
            'marvel.public_key' => 'test-public', 'marvel.private_key' => 'test-private',
            'marvel.retry_times' => 1,
        ]);
        $handler = Log::channel('capture')->getLogger()->getHandlers()[0];
        Http::preventStrayRequests();
        Http::fake(fn () => Http::failedConnection('Connection failed at https://marvel.test?apikey=synthetic-api-key&hash=synthetic-signature'));

        $response = $this->getJson('/api/v1/characters')->assertStatus(502)
            ->assertJsonPath('code', 'upstream-unavailable')
            ->assertDontSee('synthetic-api-key')->assertDontSee('synthetic-signature');

        $records = $handler->getRecords();
        self::assertNotEmpty($records);
        $formatter = new LineFormatter(includeStacktraces: true);
        $output = implode('', array_map($formatter->format(...), $records));
        self::assertTrue(str_contains($output, $response->headers->get('X-Request-ID')), 'Logs must retain request correlation.');
        self::assertTrue(str_contains($output, 'marvel.upstream_connection_failed'), 'Logs must identify the safe transport failure event.');
        self::assertFalse(str_contains($output, 'synthetic-api-key'), 'Logs must not contain a transport API key.');
        self::assertFalse(str_contains($output, 'synthetic-signature'), 'Logs must not contain a transport signature.');
        Http::assertSentCount(1);
    }
}
