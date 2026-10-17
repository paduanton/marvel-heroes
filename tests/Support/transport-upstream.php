<?php

if (PHP_SAPI !== 'cli-server' || getenv('TEST_MARVEL_TRANSPORT') !== '1' || ($_SERVER['REMOTE_ADDR'] ?? '') !== '127.0.0.1') {
    http_response_code(503);
    exit;
}

$directory = getenv('MARVEL_TRANSPORT_DIRECTORY');
$state = json_decode(file_get_contents($directory.'/state.json'), true, flags: JSON_THROW_ON_ERROR);
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$timestamp = $_GET['ts'] ?? null;
$signature = $_GET['hash'] ?? null;
$validSignature = is_string($timestamp) && is_string($signature)
    && ($_GET['apikey'] ?? null) === 'transport-public'
    && hash_equals(md5($timestamp.'transport-private'.'transport-public'), $signature);
file_put_contents($directory.'/calls.jsonl', json_encode([
    'path' => $path, 'method' => $_SERVER['REQUEST_METHOD'],
    'signature_valid' => $validSignature, 'private_key_absent' => ! isset($_GET['private_key']),
], JSON_THROW_ON_ERROR).PHP_EOL, FILE_APPEND | LOCK_EX);
$callNumber = count(file($directory.'/calls.jsonl', FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES));
register_shutdown_function(static function () use ($directory): void {
    file_put_contents($directory.'/completed.jsonl', "done\n", FILE_APPEND | LOCK_EX);
});

if (isset($state['expected_query'])) {
    $parameters = array_diff_key($_GET, array_flip(['ts', 'apikey', 'hash']));
    $expected = $state['expected_query'];
    ksort($parameters);
    ksort($expected);
    if (! $validSignature || $parameters !== $expected) {
        http_response_code(400);
        exit;
    }
}

if (($state['mode'] ?? '') === 'slow' || (($state['mode'] ?? '') === 'slow_once' && $callNumber === 1)) {
    usleep(1500000);
}

if (($state['mode'] ?? 'healthy') === 'redirect' && $path !== '/followed') {
    header('Location: /followed', true, $state['status'] ?? 302);
    exit;
}

header('Content-Type: application/json');
if (($state['mode'] ?? '') === 'http_error') {
    http_response_code($state['status']);
    echo '{"message":"Transport-only diagnostic with transport-public and transport-private"}';
    exit;
}
if (($state['mode'] ?? '') === 'malformed') {
    echo $state['body'];
    exit;
}
if (($state['mode'] ?? '') === 'empty') {
    echo '{"data":{"results":[],"total":0}}';
    exit;
}
$record = str_ends_with($path, '/comics') ? ['id' => 1, 'title' => 'Transport Comic']
    : (str_ends_with($path, '/stories') ? ['id' => 1, 'title' => 'Transport Story'] : ['id' => 1, 'name' => 'Transport Hero']);
echo json_encode(['data' => ['results' => [$record], 'total' => 1]], JSON_THROW_ON_ERROR);
