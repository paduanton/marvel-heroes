<?php

return [
    'provider' => env('CATALOG_PROVIDER', 'local'),
    'metron' => [
        'token' => env('METRON_API_TOKEN'),
        'requests_per_minute' => (int) env('METRON_REQUESTS_PER_MINUTE', 15),
        'requests_per_day' => (int) env('METRON_REQUESTS_PER_DAY', 4000),
    ],
];
