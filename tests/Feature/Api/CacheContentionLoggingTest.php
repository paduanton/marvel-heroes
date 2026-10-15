<?php

namespace Tests\Feature\Api;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Monolog\Handler\TestHandler;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class CacheContentionLoggingTest extends TestCase
{
    #[DataProvider('cachedResponses')]
    public function test_lock_contention_is_logged_without_query_or_payload(bool $stale): void
    {
        config([
            'logging.default' => 'capture',
            'logging.channels.capture' => ['driver' => 'monolog', 'handler' => TestHandler::class],
            'marvel.public_key' => 'test-public', 'marvel.private_key' => 'test-private',
        ]);
        Cache::flush();
        $handler = Log::channel('capture')->getLogger()->getHandlers()[0];
        Http::preventStrayRequests();
        Http::fake(['*' => Http::response(['data' => ['results' => [], 'total' => 0]])]);
        $path = '/api/v1/characters?query=synthetic-search';
        $parameters = ['limit' => 20, 'offset' => 0, 'query' => 'synthetic-search'];
        $key = 'marvel:v1:characters:'.hash('sha256', json_encode($parameters, JSON_THROW_ON_ERROR));
        if ($stale) {
            $this->getJson($path)->assertOk();
            $entry = Cache::get($key);
            $entry['fresh_until'] = now()->subSecond()->getTimestamp();
            Cache::put($key, $entry, 3600);
        }
        $handler->clear();
        $lock = Cache::lock($key.':lock', 60);
        self::assertTrue($lock->get());
        try {
            $response = $this->getJson($path)->assertStatus($stale ? 200 : 503);
            $events = array_values(array_filter($handler->getRecords(), fn ($record) => $record->message === 'marvel.cache_lock_contended'));
            self::assertCount(1, $events);
            self::assertSame([
                'request_id' => $response->headers->get('X-Request-ID'),
                'resource' => 'characters', 'stale_available' => $stale,
            ], $events[0]->context);
            if ($stale) {
                $response->assertJsonPath('meta.cache.state', 'stale');
            } else {
                $response->assertJsonPath('code', 'cache-refresh-in-progress');
            }
            Http::assertSentCount($stale ? 1 : 0);
        } finally {
            $lock->release();
        }
    }

    public static function cachedResponses(): array
    {
        return ['cold' => [false], 'stale' => [true]];
    }
}
