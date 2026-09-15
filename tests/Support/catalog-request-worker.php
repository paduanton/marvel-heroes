<?php

use Illuminate\Contracts\Console\Kernel as ConsoleKernel;
use Illuminate\Contracts\Http\Kernel;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\Http;
use Monolog\Handler\NullHandler;

require __DIR__.'/../../vendor/autoload.php';

if (! getenv('TEST_REDIS_HOST')) {
    throw new RuntimeException('An isolated TEST_REDIS_HOST is required.');
}

putenv('APP_ENV=testing');
putenv('APP_KEY=base64:'.base64_encode(random_bytes(32)));
$options = json_decode($argv[1], true, flags: JSON_THROW_ON_ERROR);
$app = require __DIR__.'/../../bootstrap/app.php';
$app->make(ConsoleKernel::class)->bootstrap();

// Each test owns a namespace; never flush a Redis database shared with other tests.
$connection = ['host' => getenv('TEST_REDIS_HOST'), 'port' => 6379, 'database' => 0];
config([
    'app.debug' => false,
    'cache.default' => 'redis',
    'cache.prefix' => $options['prefix'],
    'database.redis.client' => 'phpredis',
    'database.redis.options' => ['prefix' => $options['prefix']],
    'database.redis.default' => $connection,
    'database.redis.cache' => $connection,
    'logging.default' => 'null',
    'logging.channels.null' => ['driver' => 'monolog', 'handler' => NullHandler::class],
    'marvel.base_url' => 'https://marvel.test/v1/public',
    'marvel.public_key' => 'test-public',
    'marvel.private_key' => 'test-private',
    'marvel.daily_budget' => $options['budget'],
    'marvel.timeout_seconds' => $options['timeout'],
    'marvel.retry_times' => $options['attempts'],
    'marvel.cache.fresh_days' => 30,
    'marvel.cache.stale_days' => 180,
]);
// Keep time moving so Laravel's blocking lock can reach its deadline.
Date::setTestNow(fn ($realNow) => $realNow->addSeconds($options['time_offset']));
Http::preventStrayRequests();
Http::fake(['marvel.test/*' => function () use ($options) {
    fwrite(STDERR, "UPSTREAM\n");
    if ($options['hold']) {
        fgets(STDIN);
    }

    return Http::response(['data' => [
        'results' => [['id' => 1, 'name' => $options['name']]],
        'total' => 1,
    ]]);
}]);

fwrite(STDERR, "READY\n");
fgets(STDIN);
$kernel = $app->make(Kernel::class);
$request = Request::create($options['path'], 'GET', server: ['HTTP_ACCEPT' => 'application/json']);
$response = $kernel->handle($request);
echo json_encode([
    'status' => $response->getStatusCode(),
    'body' => json_decode($response->getContent(), true, flags: JSON_THROW_ON_ERROR),
], JSON_THROW_ON_ERROR);
$kernel->terminate($request, $response);
