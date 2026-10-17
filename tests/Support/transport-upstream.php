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
if (($state['mode'] ?? 'healthy') === 'redirect' && $path !== '/followed') {
    header('Location: /followed', true, $state['status'] ?? 302);
    exit;
}

header('Content-Type: application/json');
$record = str_ends_with($path, '/comics') ? ['id' => 1, 'title' => 'Transport Comic']
    : (str_ends_with($path, '/stories') ? ['id' => 1, 'title' => 'Transport Story'] : ['id' => 1, 'name' => 'Transport Hero']);
echo json_encode(['data' => ['results' => [$record], 'total' => 1]], JSON_THROW_ON_ERROR);
