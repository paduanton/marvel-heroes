<?php

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Symfony\Component\Process\Process;

class SyntheticUpstreamGuardTest extends TestCase
{
    #[DataProvider('unsafeEnvironments')]
    public function test_fixture_commands_refuse_unsafe_execution(string $fixture, array $environment): void
    {
        $process = new Process([PHP_BINARY, dirname(__DIR__).'/Support/'.$fixture, 'configure'], env: $environment, timeout: 5);
        $process->setInput('{}');
        $process->run();
        self::assertSame(1, $process->getExitCode());
        self::assertSame('', $process->getOutput());
        self::assertSame('', $process->getErrorOutput());
    }

    public function test_the_http_fixture_rejects_an_unknown_mode(): void
    {
        $process = new Process([PHP_BINARY, dirname(__DIR__).'/Support/deployment-upstream.php', 'configure'], env: [
            'MARVEL_SYNTHETIC_UPSTREAM' => '1', 'APP_ENV' => 'integration',
        ], timeout: 5);
        $process->setInput('{"id":123,"query":"http-test","mode":"unknown"}');
        $process->run();
        self::assertSame(1, $process->getExitCode());
        self::assertSame('', $process->getOutput());
        self::assertSame('', $process->getErrorOutput());
    }

    public static function unsafeEnvironments(): array
    {
        $safe = ['MARVEL_SYNTHETIC_UPSTREAM' => '1', 'MARVEL_DEPLOYMENT_TEST' => '1', 'APP_ENV' => 'integration', 'DB_DATABASE' => 'identity_test'];

        return [
            'HTTP fixture without opt-in' => ['deployment-upstream.php', array_replace($safe, ['MARVEL_SYNTHETIC_UPSTREAM' => false])],
            'HTTP fixture in production' => ['deployment-upstream.php', array_replace($safe, ['APP_ENV' => 'production'])],
            'cache fixture without opt-in' => ['deployment-cache-state.php', array_replace($safe, ['MARVEL_SYNTHETIC_UPSTREAM' => false])],
            'cache fixture in production' => ['deployment-cache-state.php', array_replace($safe, ['APP_ENV' => 'production'])],
            'cache fixture without deployment opt-in' => ['deployment-cache-state.php', array_replace($safe, ['MARVEL_DEPLOYMENT_TEST' => false])],
            'cache fixture with an existing database' => ['deployment-cache-state.php', array_replace($safe, ['DB_DATABASE' => 'existing_database'])],
        ];
    }
}
