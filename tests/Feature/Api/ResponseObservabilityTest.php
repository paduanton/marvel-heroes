<?php

namespace Tests\Feature\Api;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Monolog\Handler\TestHandler;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class ResponseObservabilityTest extends TestCase
{
    #[DataProvider('responses')]
    public function test_each_response_logs_only_safe_correlated_metadata(string $path, int $status, ?string $template): void
    {
        config([
            'logging.default' => 'capture',
            'logging.channels.capture' => ['driver' => 'monolog', 'handler' => TestHandler::class],
            'marvel.public_key' => 'test-public', 'marvel.private_key' => 'test-private',
        ]);
        $handler = Log::channel('capture')->getLogger()->getHandlers()[0];
        Http::preventStrayRequests();
        Http::fake(['*' => Http::response(['data' => ['results' => [], 'total' => 0]])]);
        $separator = str_contains($path, '?') ? '&' : '?';
        $headers = [
            'X-Request-ID' => '43fbf22f-26cb-4347-bcb0-aef23d9def97',
            'Cookie' => 'synthetic-cookie',
        ];
        if ($path !== '/api/v1/me') {
            $headers['Authorization'] = 'Bearer synthetic-token';
        }
        $response = $this->withHeaders($headers)->getJson($path.$separator.'query=synthetic-search&extra=synthetic-secret')->assertStatus($status);

        $events = array_values(array_filter($handler->getRecords(), fn ($record) => $record->message === 'http.request_completed'));
        self::assertCount(1, $events);
        $context = $events[0]->context;
        $keys = array_keys($context);
        sort($keys);
        self::assertSame(['duration_ms', 'method', 'request_id', 'route', 'status'], $keys);
        self::assertSame('GET', $context['method']);
        self::assertSame($status, $context['status']);
        if ($template !== null) {
            self::assertSame($template, $context['route']);
        }
        self::assertSame($response->headers->get('X-Request-ID'), $context['request_id']);
        self::assertIsFloat($context['duration_ms']);
        self::assertGreaterThanOrEqual(0, $context['duration_ms']);
        self::assertFalse(str_contains(json_encode($context), 'synthetic-'), 'Response metadata must not include client data.');
    }

    public static function responses(): array
    {
        return [
            'collection' => ['/api/v1/characters', 200, 'api/v1/characters'],
            'missing detail' => ['/api/v1/characters/91', 404, 'api/v1/characters/{characterId}'],
            'unknown path' => ['/api/v1/synthetic-path', 404, null],
            'invalid pagination' => ['/api/v1/characters?page=0', 422, 'api/v1/characters'],
            'private route' => ['/api/v1/me', 401, 'api/v1/me'],
        ];
    }

    public function test_conditional_and_throttled_responses_log_their_final_status_once(): void
    {
        config([
            'logging.default' => 'capture',
            'logging.channels.capture' => ['driver' => 'monolog', 'handler' => TestHandler::class],
            'marvel.public_key' => 'test-public', 'marvel.private_key' => 'test-private',
        ]);
        $handler = Log::channel('capture')->getLogger()->getHandlers()[0];
        Http::preventStrayRequests();
        Http::fake(['*' => Http::response(['data' => ['results' => [], 'total' => 0]])]);
        $initial = $this->getJson('/api/v1/characters')->assertOk();
        $handler->clear();
        $this->withHeader('If-None-Match', $initial->headers->get('ETag'))->getJson('/api/v1/characters')->assertStatus(304);
        $events = array_values(array_filter($handler->getRecords(), fn ($record) => $record->message === 'http.request_completed'));
        self::assertCount(1, $events);
        self::assertSame(304, $events[0]->context['status']);
        $this->flushHeaders();
        for ($attempt = 2; $attempt < 60; $attempt++) {
            $this->getJson('/api/v1/characters')->assertOk();
        }
        $handler->clear();
        $response = $this->getJson('/api/v1/characters')->assertStatus(429);
        $events = array_values(array_filter($handler->getRecords(), fn ($record) => $record->message === 'http.request_completed'));
        self::assertCount(1, $events);
        self::assertSame(429, $events[0]->context['status']);
        self::assertSame($response->headers->get('X-Request-ID'), $events[0]->context['request_id']);
        Http::assertSentCount(1);
    }
}
