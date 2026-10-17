<?php

if (getenv('MARVEL_SYNTHETIC_UPSTREAM') !== '1' || getenv('APP_ENV') !== 'integration') {
    http_response_code(503);
    exit(1);
}

$stateFile = '/tmp/marvel-upstream-state.json';
$callsFile = '/tmp/marvel-upstream-calls.jsonl';
if (PHP_SAPI === 'cli') {
    if (($argv[1] ?? '') === 'configure') {
        $state = json_decode(stream_get_contents(STDIN), true, flags: JSON_THROW_ON_ERROR);
        if (! is_array($state) || ! is_int($state['id'] ?? null) || $state['id'] < 1
            || ! is_string($state['query'] ?? null)
            || ! in_array($state['mode'] ?? null, ['healthy', 'redirect', 'failure', 'truncated', 'malformed'], true)) {
            exit(1);
        }
        if ($state['reset_calls'] ?? false) {
            file_put_contents($callsFile, '');
        }
        file_put_contents($stateFile, json_encode($state, JSON_THROW_ON_ERROR), LOCK_EX);
    } elseif (($argv[1] ?? '') === 'calls') {
        $lines = is_file($callsFile) ? file($callsFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) : [];
        echo json_encode(array_map(static fn (string $line): array => json_decode($line, true, flags: JSON_THROW_ON_ERROR), $lines), JSON_THROW_ON_ERROR);
    } else {
        exit(1);
    }
    exit;
}

if (PHP_SAPI !== 'cli-server' || ! is_file($stateFile)) {
    http_response_code(503);
    exit;
}
$state = json_decode(file_get_contents($stateFile), true, flags: JSON_THROW_ON_ERROR);
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$timestamp = $_GET['ts'] ?? null;
$signature = $_GET['hash'] ?? null;
$signed = is_string($timestamp) && is_string($signature) && ($_GET['apikey'] ?? '') === 'synthetic-public'
    && hash_equals(md5($timestamp.'synthetic-private'.'synthetic-public'), $signature);
file_put_contents($callsFile, json_encode([
    'path' => $path, 'method' => $_SERVER['REQUEST_METHOD'], 'signature_valid' => $signed,
], JSON_THROW_ON_ERROR).PHP_EOL, FILE_APPEND | LOCK_EX);
if (! $signed || $_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(401);
    exit;
}
if ($state['mode'] === 'redirect') {
    header('Location: /redirect-target', true, 302);
    exit;
}
header('Content-Type: application/json');
if (in_array($state['mode'], ['failure', 'truncated'], true)) {
    http_response_code(503);
    $body = '{"message":"Synthetic upstream-only diagnostic"}';
    if ($state['mode'] === 'truncated') {
        header('Content-Length: '.(strlen($body) + 64));
        header('Connection: close');
    }
    echo $body;
    exit;
}
if ($state['mode'] === 'malformed') {
    echo '{"data":';
    exit;
}
$characters = array_map(static fn (int $index): array => [
    'id' => $state['id'] + $index, 'name' => $state['query'].' Hero '.($index + 1),
    'description' => 'Synthetic character served over real HTTP.',
], range(0, 20));
if ($path === '/v1/public/characters') {
    $prefix = strtolower($_GET['nameStartsWith'] ?? '');
    $records = array_values(array_filter($characters, static fn (array $record): bool => str_starts_with(strtolower($record['name']), $prefix)));
} elseif (preg_match('~/characters/([0-9]+)$~', $path, $matches)) {
    $records = array_values(array_filter($characters, static fn (array $record): bool => $record['id'] === (int) $matches[1]));
} elseif (str_ends_with($path, '/stories')) {
    $records = array_map(static fn (int $index): array => [
        'id' => $state['id'] + 100 + $index, 'title' => 'Synthetic Story '.($index + 1),
        'type' => 'story', 'comics' => ['available' => 21],
    ], range(0, 10));
} elseif (str_ends_with($path, '/comics')) {
    $records = array_map(static fn (int $index): array => [
        'id' => $state['id'] + 200 + $index, 'title' => 'Synthetic Comic #'.($index + 1),
        'format' => 'Comic',
    ], range(0, 20));
} else {
    http_response_code(404);
    exit;
}
$offset = (int) ($_GET['offset'] ?? 0);
$limit = (int) ($_GET['limit'] ?? 20);
echo json_encode(['data' => ['results' => array_slice($records, $offset, $limit), 'total' => count($records)]], JSON_THROW_ON_ERROR);
