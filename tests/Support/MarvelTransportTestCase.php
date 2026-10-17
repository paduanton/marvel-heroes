<?php

namespace Tests\Support;

use Illuminate\Support\Facades\Cache;
use Symfony\Component\Process\Process;
use Tests\TestCase;

abstract class MarvelTransportTestCase extends TestCase
{
    protected ?Process $server = null;

    private ?string $directory = null;

    protected function setUp(): void
    {
        parent::setUp();
        if (getenv('TEST_MARVEL_TRANSPORT') !== '1') {
            $this->markTestSkipped('Opt in with TEST_MARVEL_TRANSPORT=1 inside an isolated container with --network none.');
        }
        self::assertTrue(extension_loaded('curl'), 'The transport check requires the deployed cURL handler.');
        self::assertSame('array', config('cache.default'), 'Transport tests must never flush a shared cache.');
        Cache::flush();
        $this->directory = sys_get_temp_dir().'/marvel-transport-'.bin2hex(random_bytes(12));
        mkdir($this->directory, 0700);
        $this->source('healthy');
        $socket = stream_socket_server('tcp://127.0.0.1:0');
        self::assertIsResource($socket);
        $address = stream_socket_get_name($socket, false);
        fclose($socket);
        $this->server = new Process([
            PHP_BINARY, '-S', $address, __DIR__.'/transport-upstream.php',
        ], dirname(__DIR__, 2), [
            'TEST_MARVEL_TRANSPORT' => '1', 'MARVEL_TRANSPORT_DIRECTORY' => $this->directory,
            'PHP_CLI_SERVER_WORKERS' => false,
        ], timeout: 60);
        $this->server->start();
        $deadline = microtime(true) + 5;
        $ready = false;
        do {
            $connection = @stream_socket_client('tcp://'.$address, timeout: 0.1);
            if (is_resource($connection)) {
                $ready = true;
                fclose($connection);
                break;
            }
            usleep(10000);
        } while ($this->server->isRunning() && microtime(true) < $deadline);
        self::assertTrue($ready, 'The isolated upstream must start before requests are made.');
        config([
            'marvel.base_url' => 'http://'.$address.'/v1/public',
            'marvel.public_key' => 'transport-public', 'marvel.private_key' => 'transport-private',
            'marvel.timeout_seconds' => 1, 'marvel.retry_times' => 2, 'marvel.daily_budget' => 10,
            'marvel.cache.fresh_days' => 30, 'marvel.cache.stale_days' => 180,
        ]);
    }

    protected function tearDown(): void
    {
        try {
            $this->server?->stop(0.2);
            if ($this->directory !== null) {
                foreach (['state.json', 'calls.jsonl', 'completed.jsonl'] as $file) {
                    if (is_file($this->directory.'/'.$file)) {
                        unlink($this->directory.'/'.$file);
                    }
                }
                rmdir($this->directory);
            }
        } finally {
            parent::tearDown();
        }
    }

    protected function source(string $mode, array $options = []): void
    {
        file_put_contents($this->directory.'/state.json', json_encode(
            ['mode' => $mode] + $options, JSON_THROW_ON_ERROR,
        ), LOCK_EX);
    }

    protected function calls(): array
    {
        $path = $this->directory.'/calls.jsonl';

        return is_file($path) ? array_map(
            static fn (string $line): array => json_decode($line, true, flags: JSON_THROW_ON_ERROR),
            file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES),
        ) : [];
    }

    protected function awaitCompletedCalls(int $count): void
    {
        $path = $this->directory.'/completed.jsonl';
        $deadline = microtime(true) + 5;
        do {
            $completed = is_file($path) ? count(file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES)) : 0;
            if ($completed >= $count) {
                break;
            }
            usleep(10000);
        } while ($this->server->isRunning() && microtime(true) < $deadline);
        self::assertSame($count, $completed, 'The source must finish pending responses before recovery is tested.');
    }

    public static function catalogResources(): array
    {
        return [
            'characters' => ['/api/v1/characters', 'data.0.name', 'Transport Hero'],
            'character' => ['/api/v1/characters/1', 'data.name', 'Transport Hero'],
            'stories' => ['/api/v1/characters/1/stories', 'data.0.title', 'Transport Story'],
            'comics' => ['/api/v1/stories/1/comics', 'data.0.title', 'Transport Comic'],
        ];
    }
}
