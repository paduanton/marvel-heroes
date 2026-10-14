<?php

use Illuminate\Contracts\Http\Kernel;
use Illuminate\Http\Request;
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
$app = require __DIR__.'/../../bootstrap/app.php';
$kernel = $app->make(Kernel::class);
$kernel->bootstrap();
config(['marvel.public_key' => 'test-only', 'marvel.private_key' => 'test-only']);
Http::preventStrayRequests();
Http::fake(['*' => Http::response(['data' => [
    'offset' => 0, 'limit' => 20, 'total' => 1, 'count' => 1,
    'results' => [['id' => 1, 'name' => 'Spider-Man', 'description' => 'A browser test character.', 'modified' => null]],
]])]);
$request = Request::capture();
$response = $kernel->handle($request);
$response->send();
$kernel->terminate($request, $response);
