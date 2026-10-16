<?php

use App\Shared\Marvel\Contracts\MarvelCatalogGateway;
use App\User;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;

if (PHP_SAPI !== 'cli' || getenv('MARVEL_DEPLOYMENT_TEST') !== '1' || getenv('APP_ENV') !== 'integration' || getenv('DB_DATABASE') !== 'identity_test') {
    exit(1);
}

require '/var/www/html/vendor/autoload.php';
$app = require '/var/www/html/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
config(['marvel.base_url' => 'https://marvel.test/v1/public', 'marvel.public_key' => 'test-only', 'marvel.private_key' => 'test-only']);
Http::preventStrayRequests();
$source = require '/var/www/html/tests/Support/paginated-catalog.php';
Http::fake(fn ($request) => Http::response($source($request)));

$catalog = $app->make(MarvelCatalogGateway::class);
$catalog->characters('', 0, 20);
$catalog->characters('', 20, 20);
$catalog->characters('sp', 0, 20);
$catalog->character(1);
$catalog->stories(1, 0, 10);
$catalog->stories(1, 10, 10);
$catalog->comics(101, 0, 20);
$catalog->comics(101, 20, 20);
$catalog->comics(111, 0, 20);
$catalog->comics(111, 20, 20);

foreach (['desktop', 'mobile'] as $viewport) {
    foreach (['login', 'session'] as $scenario) {
        User::query()->create([
            'name' => 'PostgreSQL Recovery Visitor',
            'email' => "postgres-{$scenario}-{$viewport}@example.test",
            'password' => Hash::make('valid-postgres-test-passphrase'),
        ]);
    }
}
echo "Synthetic deployment fixtures prepared.\n";
