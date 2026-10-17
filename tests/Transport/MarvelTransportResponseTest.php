<?php

namespace Tests\Transport;

use Illuminate\Support\Facades\Log;
use Monolog\Formatter\LineFormatter;
use Monolog\Handler\TestHandler;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\MarvelTransportTestCase;

class MarvelTransportResponseTest extends MarvelTransportTestCase
{
    #[DataProvider('resourceParameters')]
    public function test_signed_gets_preserve_resource_filters_and_reuse_fresh_cache(string $path, string $upstreamPath, array $parameters): void
    {
        $this->source('healthy', ['expected_query' => $parameters]);
        $fresh = $this->getJson($path)->assertOk()->assertJsonPath('meta.cache.state', 'fresh');
        $this->withHeader('If-None-Match', $fresh->headers->get('ETag'))->getJson($path)->assertStatus(304);
        self::assertSame([[
            'path' => '/v1/public/'.$upstreamPath, 'method' => 'GET',
            'signature_valid' => true, 'private_key_absent' => true,
        ]], $this->calls());
    }

    #[DataProvider('httpFailures')]
    public function test_error_statuses_are_not_retried_cached_or_exposed(int $status): void
    {
        config([
            'logging.default' => 'capture',
            'logging.channels.capture' => ['driver' => 'monolog', 'handler' => TestHandler::class],
        ]);
        $handler = Log::channel('capture')->getLogger()->getHandlers()[0];
        $this->source('http_error', ['status' => $status]);
        $response = $this->getJson('/api/v1/characters')->assertStatus(502)
            ->assertHeader('Content-Type', 'application/problem+json')->assertHeaderMissing('ETag')
            ->assertJsonPath('code', 'upstream-unavailable');
        self::assertCount(1, $this->calls());
        $formatter = new LineFormatter(includeStacktraces: true);
        $logs = implode('', array_map($formatter->format(...), $handler->getRecords()));
        self::assertStringContainsString($response->headers->get('X-Request-ID'), $logs);
        foreach (['transport-public', 'transport-private', 'Transport-only diagnostic'] as $privateValue) {
            self::assertStringNotContainsString($privateValue, $logs.$response->getContent());
        }
        $this->source('healthy');
        $this->getJson('/api/v1/characters')->assertOk()->assertJsonPath('meta.cache.state', 'fresh');
        self::assertCount(2, $this->calls());
    }

    #[DataProvider('invalidBodies')]
    public function test_malformed_responses_do_not_replace_or_renew_stale_entries(string $body): void
    {
        $fresh = $this->getJson('/api/v1/characters')->assertOk();
        $this->travel(31)->days();
        $this->source('malformed', ['body' => $body]);
        $stale = $this->getJson('/api/v1/characters')->assertOk()->assertJsonPath('meta.cache.state', 'stale');
        self::assertSame($fresh->json('data'), $stale->json('data'));
        self::assertCount(2, $this->calls());
        $this->travel(150)->days();
        $this->getJson('/api/v1/characters')->assertStatus(502)
            ->assertJsonPath('code', 'upstream-unavailable')->assertHeaderMissing('ETag');
        self::assertCount(3, $this->calls());
        $this->source('healthy');
        $this->getJson('/api/v1/characters')->assertOk()->assertJsonPath('meta.cache.state', 'fresh');
        $this->getJson('/api/v1/characters')->assertOk();
        self::assertCount(4, $this->calls());
    }

    #[DataProvider('catalogResources')]
    public function test_empty_results_keep_the_existing_collection_and_detail_semantics(string $path, string $labelPath, string $label): void
    {
        $this->source('empty');
        $detail = $path === '/api/v1/characters/1';
        foreach ([1, 2] as $request) {
            $response = $this->getJson($path)->assertStatus($detail ? 404 : 200);
            if ($detail) {
                $response->assertJsonPath('code', 'resource-not-found')->assertHeaderMissing('ETag');
            } else {
                $response->assertJsonPath('data', [])->assertJsonPath('meta.total', 0)
                    ->assertJsonPath('meta.cache.state', 'fresh');
            }
        }
        self::assertCount(1, $this->calls());
        $this->source('healthy');
        $this->travel(31)->days();
        $this->getJson($path)->assertOk()->assertJsonPath($labelPath, $label);
        self::assertCount(2, $this->calls());
    }

    public static function resourceParameters(): array
    {
        return [
            'character search' => [
                '/api/v1/characters?query=%20SPIDER%20&page=3&per_page=7', 'characters',
                ['nameStartsWith' => 'spider', 'offset' => '14', 'limit' => '7', 'orderBy' => 'name'],
            ],
            'character detail' => ['/api/v1/characters/1', 'characters/1', []],
            'stories page' => [
                '/api/v1/characters/1/stories?page=2&per_page=10', 'characters/1/stories',
                ['offset' => '10', 'limit' => '10', 'orderBy' => 'modified'],
            ],
            'comics page' => [
                '/api/v1/stories/1/comics?page=4&per_page=20', 'stories/1/comics',
                ['offset' => '60', 'limit' => '20', 'orderBy' => '-onsaleDate'],
            ],
        ];
    }

    public static function httpFailures(): array
    {
        return ['rate limit' => [429], 'server error' => [500], 'unavailable' => [503]];
    }

    public static function invalidBodies(): array
    {
        return [
            'invalid JSON' => ['{"data":'],
            'object instead of list' => ['{"data":{"results":{},"total":0}}'],
            'invalid record' => ['{"data":{"results":[{"id":1,"name":null}],"total":1}}'],
            'unsafe identifier' => ['{"data":{"results":[{"id":9007199254740992,"name":"Invalid Hero"}],"total":1}}'],
        ];
    }
}
