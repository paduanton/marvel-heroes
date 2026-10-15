<?php

namespace Tests\Integration;

use PHPUnit\Framework\TestCase;
use Symfony\Component\Process\Process;

class RedisCacheWarmupTest extends TestCase
{
    private string $prefix;

    protected function setUp(): void
    {
        parent::setUp();
        if (! getenv('TEST_REDIS_HOST')) {
            $this->markTestSkipped('Set TEST_REDIS_HOST to an isolated, disposable Redis instance.');
        }
        $this->prefix = 'marvel-warm-test:'.bin2hex(random_bytes(12)).':';
    }

    public function test_preview_does_not_populate_cache_and_warmup_is_shared_with_http_readers(): void
    {
        $preview = $this->runWorker(['warm_queries' => [' SP ', 'sp', ''], 'dry_run' => true]);
        self::assertSame(0, $preview['exit']);
        self::assertSame(0, $preview['calls']);
        self::assertStringContainsString('2 unique queries', $preview['output']);
        self::assertSame(503, $this->runWorker(['path' => '/api/v1/characters?query=sp', 'budget' => 0])['status']);

        $warm = $this->runWorker(['warm_queries' => [' SP ', 'sp', ''], 'budget' => 2]);
        self::assertSame(0, $warm['exit']);
        self::assertSame(2, $warm['calls']);
        self::assertStringContainsString('2 fresh, 0 stale, 0 failed', $warm['output']);
        foreach (['/api/v1/characters?query=sp', '/api/v1/characters'] as $path) {
            $read = $this->runWorker(['path' => $path, 'budget' => 0]);
            self::assertSame(200, $read['status']);
            self::assertSame('fresh', $read['body']['meta']['cache']['state']);
            self::assertSame(0, $read['calls']);
        }
        $repeat = $this->runWorker(['warm_queries' => ['sp', ''], 'budget' => 0]);
        self::assertSame(0, $repeat['exit']);
        self::assertSame(0, $repeat['calls']);
        self::assertSame(503, $this->runWorker(['path' => '/api/v1/characters?page=2', 'budget' => 0])['status']);
    }

    public function test_invalid_warmup_does_not_spend_the_budget_shared_by_other_processes(): void
    {
        $invalid = $this->runWorker(['warm_queries' => ['sp', 'x'], 'budget' => 1]);
        self::assertSame(2, $invalid['exit']);
        self::assertSame(0, $invalid['calls']);
        $valid = $this->runWorker(['warm_queries' => ['sp'], 'budget' => 1]);
        self::assertSame(0, $valid['exit']);
        self::assertSame(1, $valid['calls']);
        $blocked = $this->runWorker(['path' => '/api/v1/characters?query=iron', 'budget' => 1]);
        self::assertSame(503, $blocked['status']);
        self::assertSame('upstream-budget-exhausted', $blocked['body']['code']);
        self::assertSame(0, $blocked['calls']);
    }

    public function test_warmup_distinguishes_stale_fallback_from_unavailable_queries(): void
    {
        self::assertSame(0, $this->runWorker(['warm_queries' => ['sp']])['exit']);
        $stale = $this->runWorker(['warm_queries' => ['sp'], 'budget' => 0, 'time_offset' => 31 * 86400]);
        self::assertSame(0, $stale['exit']);
        self::assertSame(0, $stale['calls']);
        self::assertStringContainsString('0 fresh, 1 stale, 0 failed', $stale['output']);
        $missing = $this->runWorker(['warm_queries' => ['iron'], 'budget' => 0]);
        self::assertSame(1, $missing['exit']);
        self::assertSame(0, $missing['calls']);
        self::assertStringContainsString('0 fresh, 0 stale, 1 failed', $missing['output']);
        $expired = $this->runWorker(['path' => '/api/v1/characters?query=sp', 'budget' => 0, 'time_offset' => 181 * 86400]);
        self::assertSame(503, $expired['status']);
        self::assertSame('upstream-budget-exhausted', $expired['body']['code']);
    }

    private function runWorker(array $options): array
    {
        $process = new Process([PHP_BINARY, dirname(__DIR__).'/Support/catalog-request-worker.php', json_encode(array_replace([
            'prefix' => $this->prefix, 'time_offset' => 0, 'path' => '/api/v1/characters', 'budget' => 2400,
            'name' => 'Example Hero', 'hold' => false, 'timeout' => 5, 'attempts' => 2, 'status' => 200, 'empty' => false,
        ], $options), JSON_THROW_ON_ERROR)], dirname(__DIR__, 2), timeout: 30);
        $process->setInput("start\n");
        $process->run();
        self::assertSame(0, $process->getExitCode(), $process->getErrorOutput());

        return json_decode($process->getOutput(), true, flags: JSON_THROW_ON_ERROR)
            + ['calls' => substr_count($process->getErrorOutput(), 'UPSTREAM')];
    }
}
