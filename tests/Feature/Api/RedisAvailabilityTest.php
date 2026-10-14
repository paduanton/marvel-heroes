<?php

namespace Tests\Feature\Api;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Redis;
use Monolog\Formatter\LineFormatter;
use Monolog\Handler\TestHandler;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class RedisAvailabilityTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $unreachable = ['host' => '127.0.0.1', 'port' => 1, 'database' => 0, 'timeout' => 0.1, 'read_timeout' => 0.1];
        config([
            'app.debug' => true,
            'cache.default' => 'redis', 'session.driver' => 'redis', 'session.connection' => 'default',
            'database.redis.client' => 'phpredis',
            'database.redis.default' => $unreachable, 'database.redis.cache' => $unreachable,
        ]);
        Http::preventStrayRequests();
    }

    public function test_liveness_remains_available_without_a_session_store(): void
    {
        $this->getJson('/health')->assertOk()->assertExactJson(['status' => 'ok'])
            ->assertHeader('X-Request-ID')->assertHeaderMissing('Set-Cookie');
        Http::assertNothingSent();
    }

    public function test_readiness_returns_not_ready_instead_of_starting_a_session(): void
    {
        $this->getJson('/ready')->assertServiceUnavailable()->assertExactJson(['status' => 'not_ready'])
            ->assertHeader('X-Request-ID')->assertHeaderMissing('Set-Cookie');
        Http::assertNothingSent();
    }

    #[DataProvider('apiSurfaces')]
    public function test_api_dependency_failures_are_safe_problems_without_upstream_dispatch(string $method, string $path, bool $private): void
    {
        $response = $this->call($method, $path, server: ['HTTP_IF_NONE_MATCH' => '*'])
            ->assertServiceUnavailable()->assertHeader('Content-Type', 'application/problem+json')
            ->assertJsonPath('code', 'dependency-unavailable')->assertJsonPath('status', 503)
            ->assertHeaderMissing('ETag')->assertJsonMissingPath('exception')->assertJsonMissingPath('trace');
        self::assertSame($response->headers->get('X-Request-ID'), $response->json('request_id'));
        if ($private) {
            $response->assertHeader('Cache-Control', 'no-store, private');
        }
        Http::assertNothingSent();
    }

    public static function apiSurfaces(): array
    {
        return [
            'characters' => ['GET', '/api/v1/characters', false],
            'detail' => ['GET', '/api/v1/characters/1', false],
            'stories' => ['GET', '/api/v1/characters/1/stories', false],
            'comics' => ['GET', '/api/v1/stories/1/comics', false],
            'legacy catalog' => ['GET', '/api/character/example', false],
            'identity' => ['GET', '/api/v1/me', true],
            'login' => ['POST', '/api/v1/auth/login', true],
            'registration' => ['POST', '/api/v1/auth/register', true],
            'logout' => ['POST', '/api/v1/auth/logout', true],
            'csrf bootstrap' => ['GET', '/sanctum/csrf-cookie', true],
        ];
    }

    public function test_dependency_diagnostics_are_not_reported_in_logs_or_responses(): void
    {
        config([
            'logging.default' => 'capture',
            'logging.channels.capture' => ['driver' => 'monolog', 'handler' => TestHandler::class],
        ]);
        $handler = Log::channel('capture')->getLogger()->getHandlers()[0];
        Redis::shouldReceive('connection')->andThrow(new \RedisException('redis://synthetic-password@private-host/0'));

        $response = $this->getJson('/api/v1/me')->assertServiceUnavailable()
            ->assertJsonPath('code', 'dependency-unavailable')->assertDontSee('synthetic-password');
        $formatter = new LineFormatter(includeStacktraces: true);
        $output = implode('', array_map($formatter->format(...), $handler->getRecords()));
        self::assertTrue(str_contains($output, 'infrastructure.redis_unavailable'), 'Logs must identify the safe dependency failure event.');
        self::assertTrue(str_contains($output, $response->headers->get('X-Request-ID')), 'Logs must retain request correlation.');
        self::assertFalse(str_contains($output, 'synthetic-password'), 'Logs must not contain connection credentials.');
        self::assertFalse(str_contains($output, 'private-host'), 'Logs must not contain raw connection diagnostics.');
    }
}
