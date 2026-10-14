<?php

use App\Shared\Marvel\Contracts\MarvelCatalogGateway;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\Http;

if (PHP_SAPI !== 'cli' || getenv('MARVEL_DEPLOYMENT_TEST') !== '1' || getenv('APP_ENV') !== 'integration' || getenv('DB_DATABASE') !== 'identity_test') {
    exit(1);
}

require '/var/www/html/vendor/autoload.php';
$app = require '/var/www/html/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
config(['marvel.base_url' => 'https://marvel.test/v1/public', 'marvel.public_key' => 'test-only', 'marvel.private_key' => 'test-only']);
Http::preventStrayRequests();
Http::fake(function ($request) {
    $record = match (true) {
        str_contains($request->url(), '/comics') => ['id' => 1001, 'title' => 'Amazing Spider-Man #1', 'description' => 'A synthetic comic.', 'format' => 'Comic'],
        str_contains($request->url(), '/stories') => ['id' => 101, 'title' => 'Origin of a hero', 'type' => 'story', 'comics' => ['available' => 1]],
        default => ['id' => 1, 'name' => 'Spider-Man', 'description' => 'A synthetic character for deployment validation.'],
    };

    return Http::response(['data' => ['results' => [$record], 'total' => 1]]);
});

$catalog = $app->make(MarvelCatalogGateway::class);
$catalog->characters('', 0, 20);
$catalog->characters('sp', 0, 20);
$catalog->character(1);
$catalog->stories(1, 0, 10);
$catalog->comics(101, 0, 20);
echo "Synthetic deployment catalog prepared.\n";
