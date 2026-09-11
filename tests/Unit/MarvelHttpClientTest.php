<?php

namespace Tests\Unit;

use App\Shared\Marvel\Exceptions\MarvelUnavailableException;
use App\Shared\Marvel\MarvelHttpClient;
use App\Shared\Marvel\MarvelPayloadNormalizer;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class MarvelHttpClientTest extends TestCase
{
    private MarvelHttpClient $client;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'marvel.base_url' => 'https://marvel.test/v1/public',
            'marvel.public_key' => 'test-public',
            'marvel.private_key' => 'test-private',
            'marvel.retry_times' => 2,
        ]);
        Http::preventStrayRequests();
        $this->client = new MarvelHttpClient(new MarvelPayloadNormalizer);
    }

    public function test_it_returns_null_for_an_upstream_missing_character_without_retrying(): void
    {
        Http::fake(['marvel.test/*' => Http::response(['code' => 404], 404)]);

        self::assertNull($this->client->character(999));
        Http::assertSentCount(1);
    }

    #[DataProvider('upstreamErrorStatuses')]
    public function test_it_normalizes_http_failures_without_retrying_or_exposing_the_body(int $status): void
    {
        Http::fake(['marvel.test/*' => Http::response(['message' => 'Upstream-only diagnostic'], $status)]);
        $this->expectException(MarvelUnavailableException::class);
        $this->expectExceptionMessage('Marvel API returned an unsuccessful response.');

        try {
            $this->client->characters('example', 0, 20);
        } finally {
            Http::assertSentCount(1);
        }
    }

    public static function upstreamErrorStatuses(): array
    {
        return [
            'bad request' => [400],
            'unauthorized' => [401],
            'forbidden' => [403],
            'rate limited' => [429],
            'internal error' => [500],
            'unavailable' => [503],
        ];
    }

    public function test_it_recovers_from_a_transient_connection_failure(): void
    {
        $attempts = 0;
        Http::fake(function () use (&$attempts) {
            $attempts++;

            return $attempts === 1
                ? Http::failedConnection()
                : Http::response(['data' => ['results' => [['id' => 1, 'name' => 'Example Hero']], 'total' => 1]]);
        });

        $result = $this->client->characters('example', 0, 20);

        self::assertSame(2, $attempts);
        self::assertSame(1, $result['total']);
        self::assertSame('Example Hero', $result['items'][0]['name']);
    }

    public function test_it_stops_after_the_configured_connection_attempts(): void
    {
        $attempts = 0;
        Http::fake(function () use (&$attempts) {
            $attempts++;

            return Http::failedConnection();
        });
        $this->expectException(MarvelUnavailableException::class);
        $this->expectExceptionMessage('Marvel API connection failed.');

        try {
            $this->client->characters('example', 0, 20);
        } finally {
            self::assertSame(2, $attempts);
        }
    }
}
