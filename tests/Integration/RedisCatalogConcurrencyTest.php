<?php

namespace Tests\Integration;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Process\InputStream;
use Symfony\Component\Process\Process;

class RedisCatalogConcurrencyTest extends TestCase
{
    /** @var list<Process> */
    private array $processes = [];

    private string $prefix;

    protected function setUp(): void
    {
        parent::setUp();
        if (! getenv('TEST_REDIS_HOST')) {
            $this->markTestSkipped('Set TEST_REDIS_HOST to an isolated, disposable Redis instance.');
        }

        $this->prefix = 'marvel-test:'.bin2hex(random_bytes(12)).':';
    }

    protected function tearDown(): void
    {
        foreach ($this->processes as $process) {
            $process->stop(0);
        }
        parent::tearDown();
    }

    public function test_a_cold_contender_does_not_duplicate_the_refresh_or_release_its_lock(): void
    {
        [$owner, $input] = $this->startRequest(hold: true);
        $input->write("start\n");
        $this->awaitMarker($owner, 'UPSTREAM');

        // A second contender also fails: the first timeout must not release the owner's lock.
        for ($attempt = 0; $attempt < 2; $attempt++) {
            [$contender, $contenderInput] = $this->startRequest();
            $contenderInput->write("start\n");
            $result = $this->response($contender);
            self::assertSame(503, $result['status']);
            self::assertSame('cache-refresh-in-progress', $result['body']['code']);
            self::assertSame(0, substr_count($contender->getErrorOutput(), 'UPSTREAM'));
        }

        $input->write("release\n");
        self::assertSame(200, $this->response($owner)['status']);
        [$reader, $readerInput] = $this->startRequest();
        $readerInput->write("start\n");
        self::assertSame('Example Hero', $this->response($reader)['body']['data'][0]['name']);
        self::assertSame(0, substr_count($reader->getErrorOutput(), 'UPSTREAM'));
        self::assertSame(1, substr_count($owner->getErrorOutput(), 'UPSTREAM'));
    }

    public function test_a_contender_receives_stale_data_while_the_owner_refreshes(): void
    {
        [$seed, $seedInput] = $this->startRequest();
        $seedInput->write("start\n");
        self::assertSame(200, $this->response($seed)['status']);

        $timeOffset = 31 * 86400;
        [$owner, $input] = $this->startRequest(hold: true, timeOffset: $timeOffset, name: 'Updated Hero');
        $input->write("start\n");
        $this->awaitMarker($owner, 'UPSTREAM');

        [$contender, $contenderInput] = $this->startRequest(timeOffset: $timeOffset);
        $contenderInput->write("start\n");
        $result = $this->response($contender);
        self::assertSame(200, $result['status']);
        self::assertSame('Example Hero', $result['body']['data'][0]['name']);
        self::assertSame(0, substr_count($contender->getErrorOutput(), 'UPSTREAM'));

        $input->write("release\n");
        self::assertSame('Updated Hero', $this->response($owner)['body']['data'][0]['name']);
        [$reader, $readerInput] = $this->startRequest(timeOffset: $timeOffset);
        $readerInput->write("start\n");
        self::assertSame('Updated Hero', $this->response($reader)['body']['data'][0]['name']);
        self::assertSame(0, substr_count($reader->getErrorOutput(), 'UPSTREAM'));
        self::assertSame(1, substr_count($owner->getErrorOutput(), 'UPSTREAM'));
    }

    public function test_parallel_queries_cannot_spend_more_than_the_shared_budget(): void
    {
        $workers = [];
        for ($index = 0; $index < 6; $index++) {
            $workers[] = $this->startRequest(path: '/api/v1/characters?query=hero'.$index, budget: 2);
        }

        foreach ($workers as [$process, $input]) {
            $input->write("start\n");
        }

        $statuses = [];
        $upstreamCalls = 0;
        foreach ($workers as [$process]) {
            $result = $this->response($process);
            $statuses[] = $result['status'];
            $upstreamCalls += substr_count($process->getErrorOutput(), 'UPSTREAM');
            if ($result['status'] === 503) {
                self::assertSame('upstream-budget-exhausted', $result['body']['code']);
            }
        }

        sort($statuses);
        self::assertSame([200, 200, 503, 503, 503, 503], $statuses);
        self::assertSame(2, $upstreamCalls);
    }

    #[DataProvider('longRefreshSettings')]
    public function test_the_refresh_lock_covers_the_configured_request_window(int $timeout, int $attempts): void
    {
        [$owner, $input] = $this->startRequest(hold: true, timeout: $timeout, attempts: $attempts);
        $input->write("start\n");
        $this->awaitMarker($owner, 'UPSTREAM');

        // Redis uses real time: cross the old 15-second lease, not a simulated clock boundary.
        sleep(16);
        [$contender, $contenderInput] = $this->startRequest(timeout: $timeout, attempts: $attempts);
        $contenderInput->write("start\n");
        $result = $this->response($contender);
        self::assertSame(503, $result['status']);
        self::assertSame('cache-refresh-in-progress', $result['body']['code']);
        self::assertSame(0, substr_count($contender->getErrorOutput(), 'UPSTREAM'));

        $input->write("release\n");
        self::assertSame(200, $this->response($owner)['status']);
        self::assertSame(1, substr_count($owner->getErrorOutput(), 'UPSTREAM'));
    }

    public static function longRefreshSettings(): array
    {
        return [
            'longer timeout' => [20, 1],
            'more attempts' => [5, 4],
        ];
    }

    #[DataProvider('catalogResources')]
    public function test_fresh_resources_are_reused_by_another_process(string $path, string $labelPath): void
    {
        [$writer, $writerInput] = $this->startRequest(path: $path, name: 'Original');
        $writerInput->write("start\n");
        self::assertSame(200, $this->response($writer)['status']);

        [$reader, $readerInput] = $this->startRequest(path: $path, name: 'Must not be fetched');
        $readerInput->write("start\n");
        $result = $this->response($reader);
        self::assertSame(200, $result['status']);
        self::assertSame('Original', data_get($result['body'], $labelPath));
        self::assertSame(0, substr_count($reader->getErrorOutput(), 'UPSTREAM'));
    }

    #[DataProvider('catalogResources')]
    public function test_failed_refreshes_preserve_stale_data_and_release_the_lock_for_recovery(string $path, string $labelPath): void
    {
        [$seed, $seedInput] = $this->startRequest(path: $path, name: 'Original');
        $seedInput->write("start\n");
        self::assertSame(200, $this->response($seed)['status']);

        [$failure, $failureInput] = $this->startRequest(path: $path, timeOffset: 31 * 86400, status: 503);
        $failureInput->write("start\n");
        $result = $this->response($failure);
        self::assertSame(200, $result['status']);
        self::assertSame('Original', data_get($result['body'], $labelPath));
        self::assertSame(1, substr_count($failure->getErrorOutput(), 'UPSTREAM'));

        [$recovery, $recoveryInput] = $this->startRequest(path: $path, timeOffset: 32 * 86400, name: 'Recovered');
        $recoveryInput->write("start\n");
        $result = $this->response($recovery);
        self::assertSame(200, $result['status']);
        self::assertSame('Recovered', data_get($result['body'], $labelPath));
        self::assertSame(1, substr_count($recovery->getErrorOutput(), 'UPSTREAM'));
    }

    public function test_missing_characters_are_cached_across_processes_and_discovered_after_expiry(): void
    {
        $path = '/api/v1/characters/1';
        [$seed, $seedInput] = $this->startRequest(path: $path, empty: true);
        $seedInput->write("start\n");
        self::assertSame(404, $this->response($seed)['status']);

        [$reader, $readerInput] = $this->startRequest(path: $path, name: 'Premature discovery');
        $readerInput->write("start\n");
        self::assertSame(404, $this->response($reader)['status']);
        self::assertSame(0, substr_count($reader->getErrorOutput(), 'UPSTREAM'));

        [$refresh, $refreshInput] = $this->startRequest(path: $path, timeOffset: 31 * 86400, name: 'Discovered');
        $refreshInput->write("start\n");
        self::assertSame('Discovered', $this->response($refresh)['body']['data']['name']);
        self::assertSame(1, substr_count($refresh->getErrorOutput(), 'UPSTREAM'));
    }

    public function test_a_terminated_refresh_owner_recovers_after_its_lease_without_refunding_its_budget(): void
    {
        [$owner, $ownerInput] = $this->startRequest(hold: true, budget: 2);
        $ownerInput->write("start\n");
        $this->awaitMarker($owner, 'UPSTREAM');
        $owner->stop(0);

        [$contender, $contenderInput] = $this->startRequest(budget: 2);
        $contenderInput->write("start\n");
        $result = $this->response($contender);
        self::assertSame(503, $result['status']);
        self::assertSame('cache-refresh-in-progress', $result['body']['code']);
        self::assertSame(0, substr_count($contender->getErrorOutput(), 'UPSTREAM'));

        // The default lease is 20 seconds; Redis expiry is real time, not the worker's shifted clock.
        sleep(21);
        [$recovery, $recoveryInput] = $this->startRequest(budget: 2, name: 'Recovered');
        $recoveryInput->write("start\n");
        self::assertSame('Recovered', $this->response($recovery)['body']['data'][0]['name']);

        [$uncached, $uncachedInput] = $this->startRequest(path: '/api/v1/characters?query=other', budget: 2);
        $uncachedInput->write("start\n");
        $result = $this->response($uncached);
        self::assertSame(503, $result['status']);
        self::assertSame('upstream-budget-exhausted', $result['body']['code']);
        self::assertSame(0, substr_count($uncached->getErrorOutput(), 'UPSTREAM'));
    }

    public static function catalogResources(): array
    {
        return [
            'characters' => ['/api/v1/characters', 'data.0.name'],
            'character detail' => ['/api/v1/characters/1', 'data.name'],
            'stories' => ['/api/v1/characters/1/stories', 'data.0.title'],
            'comics' => ['/api/v1/stories/1/comics', 'data.0.title'],
        ];
    }

    /** @return array{Process, InputStream} */
    private function startRequest(
        bool $hold = false,
        int $timeOffset = 0,
        string $name = 'Example Hero',
        string $path = '/api/v1/characters',
        int $budget = 2400,
        int $timeout = 5,
        int $attempts = 2,
        int $status = 200,
        bool $empty = false,
    ): array {
        $input = new InputStream;
        $process = new Process([
            PHP_BINARY,
            dirname(__DIR__).'/Support/catalog-request-worker.php',
            json_encode([
                'prefix' => $this->prefix,
                'time_offset' => $timeOffset,
                'path' => $path,
                'budget' => $budget,
                'name' => $name,
                'hold' => $hold,
                'timeout' => $timeout,
                'attempts' => $attempts,
                'status' => $status,
                'empty' => $empty,
            ], JSON_THROW_ON_ERROR),
        ], dirname(__DIR__, 2), timeout: 60);
        $process->setInput($input);
        $this->processes[] = $process;
        $process->start();
        $this->awaitMarker($process, 'READY');

        return [$process, $input];
    }

    private function awaitMarker(Process $process, string $marker): void
    {
        $found = $process->waitUntil(fn () => str_contains($process->getErrorOutput(), $marker));
        self::assertTrue($found, 'Worker did not reach '.$marker.': '.$process->getErrorOutput().$process->getOutput());
    }

    /** @return array{status: int, body: array<string, mixed>} */
    private function response(Process $process): array
    {
        $process->wait();
        self::assertSame(0, $process->getExitCode(), $process->getErrorOutput());

        return json_decode($process->getOutput(), true, flags: JSON_THROW_ON_ERROR);
    }
}
