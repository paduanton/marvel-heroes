<?php

use Illuminate\Contracts\Http\Kernel;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Date;
use Illuminate\Support\Facades\Http;

if (getenv('MARVEL_HTTP_TEST') !== '1' || getenv('APP_ENV') !== 'integration' || getenv('DB_DATABASE') !== 'identity_test') {
    http_response_code(503);
    exit;
}

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if (is_string($path) && str_starts_with($path, '/build/')) {
    $asset = realpath(__DIR__.'/../../public'.$path);
    $build = realpath(__DIR__.'/../../public/build');
    if ($asset !== false && $build !== false && str_starts_with($asset, $build.DIRECTORY_SEPARATOR)) {
        return false;
    }
}

require __DIR__.'/../../vendor/autoload.php';
$request = Request::capture();
$scenario = $request->header('X-Marvel-Test-Scenario');
putenv('CACHE_PREFIX='.($scenario === null ? 'marvel_heroes_cache' : 'http-test:'.hash('sha256', $scenario).':'));
$app = require __DIR__.'/../../bootstrap/app.php';
$kernel = $app->make(Kernel::class);
$kernel->bootstrap();
config([
    'marvel.public_key' => 'test-only', 'marvel.private_key' => 'test-only',
    'marvel.daily_budget' => max(0, min(2400, (int) $request->header('X-Marvel-Test-Budget', 2400))),
]);
$age = max(0, min(365, (int) $request->header('X-Marvel-Test-Age-Days', 0)));
Date::setTestNow(fn ($realNow) => $realNow->addDays($age));
$status = $request->header('X-Marvel-Test-Upstream-Status') === '503' ? 503 : 200;
$name = $request->header('X-Marvel-Test-Revision') === '2' ? 'Recovered Hero' : 'Spider-Man';
$recordId = match ($request->header('X-Marvel-Test-Record-Id')) {
    'safe-limit' => 9007199254740991,
    'unsafe' => 9007199254740992,
    default => 1,
};
$journey = $request->header('X-Marvel-Test-Catalog') === 'journey' ? require __DIR__.'/paginated-catalog.php' : null;
Http::preventStrayRequests();
Http::fake(['*' => function ($upstreamRequest) use ($status, $name, $recordId, $journey) {
    Cache::add('test:upstream-calls', 0, now()->addHour());
    Cache::increment('test:upstream-calls');

    if ($journey !== null) {
        return Http::response($journey($upstreamRequest), $status);
    }

    return Http::response(['data' => [
        'offset' => 0, 'limit' => 20, 'total' => 1, 'count' => 1,
        'results' => [['id' => $recordId, 'digitalId' => $recordId === 1 ? null : $recordId, 'name' => $name, 'title' => $name, 'description' => 'A browser test character.', 'modified' => null]],
    ]], $status);
}]);
$response = $kernel->handle($request);
$response->headers->set('X-Test-Upstream-Calls', (string) Cache::get('test:upstream-calls', 0));
$response->send();
$kernel->terminate($request, $response);
