<?php

return [
    'base_url' => env('MARVEL_BASE_URL', 'https://gateway.marvel.com/v1/public'),
    'public_key' => env('MARVEL_PUBLIC_KEY'),
    'private_key' => env('MARVEL_PRIVATE_KEY'),
    'timeout_seconds' => (int) env('MARVEL_TIMEOUT_SECONDS', 5),
    'retry_times' => (int) env('MARVEL_RETRY_TIMES', 2),
    'cache' => [
        'fresh_days' => (int) env('MARVEL_CACHE_FRESH_DAYS', 30),
        'stale_days' => (int) env('MARVEL_CACHE_STALE_DAYS', 180),
    ],
    'daily_budget' => (int) env('MARVEL_DAILY_BUDGET', 2400),
    'warm_queries' => array_values(array_filter(array_map('trim', explode(',', (string) env('MARVEL_WARM_QUERIES', ''))))),
];
