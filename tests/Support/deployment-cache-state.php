<?php

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\Cache;

if (PHP_SAPI !== 'cli' || getenv('MARVEL_SYNTHETIC_UPSTREAM') !== '1'
    || getenv('MARVEL_DEPLOYMENT_TEST') !== '1' || getenv('APP_ENV') !== 'integration'
    || getenv('DB_DATABASE') !== 'identity_test') {
    exit(1);
}
require '/var/www/html/vendor/autoload.php';
$app = require '/var/www/html/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
if (config('cache.default') !== 'redis') {
    exit(1);
}
$input = json_decode(stream_get_contents(STDIN), true, flags: JSON_THROW_ON_ERROR);
if (($input['action'] ?? '') === 'reset-budget') {
    Cache::forget('marvel:budget:timestamps');
} elseif (($input['action'] ?? '') === 'set-budget-remaining') {
    $budget = (int) config('marvel.daily_budget');
    $remaining = $input['remaining'] ?? null;
    if (! is_int($remaining) || $remaining < 0 || $remaining > $budget) {
        exit(1);
    }
    Cache::put('marvel:budget:timestamps', array_fill(0, $budget - $remaining, now()->getTimestamp()), now()->addDay());
} elseif (($input['action'] ?? '') === 'age') {
    $allowed = [
        'characters' => ['limit', 'offset', 'query'], 'character' => ['characterId'],
        'stories' => ['characterId', 'limit', 'offset'], 'comics' => ['limit', 'offset', 'storyId'],
    ];
    foreach ($input['entries'] ?? [] as $target) {
        $resource = $target['resource'] ?? '';
        $parameters = $target['parameters'] ?? [];
        ksort($parameters);
        if (! isset($allowed[$resource]) || array_keys($parameters) !== $allowed[$resource]) {
            exit(1);
        }
        foreach ($parameters as $name => $value) {
            if ($name === 'query') {
                if (! is_string($value) || ! str_starts_with($value, 'http-') || strlen($value) > 100) {
                    exit(1);
                }
            } elseif (! is_int($value) || $value < ($name === 'offset' ? 0 : 1)
                || (in_array($name, ['characterId', 'storyId'], true) && $value < 100000)) {
                exit(1);
            }
        }
        $key = 'marvel:v1:'.$resource.':'.hash('sha256', json_encode($parameters, JSON_THROW_ON_ERROR));
        $entry = Cache::get($key);
        if (! is_array($entry) || ! is_int($entry['stale_until'] ?? null)) {
            throw new RuntimeException('The synthetic catalog entry must exist before aging.');
        }
        $entry['fresh_until'] = now()->subMinute()->getTimestamp();
        Cache::put($key, $entry, max(1, $entry['stale_until'] - now()->getTimestamp()));
    }
} else {
    exit(1);
}
