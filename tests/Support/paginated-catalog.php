<?php

use Illuminate\Http\Client\Request;

return static function (Request $request): array {
    $path = parse_url($request->url(), PHP_URL_PATH);
    parse_str(parse_url($request->url(), PHP_URL_QUERY) ?? '', $parameters);
    $characters = array_map(static fn (int $id) => [
        'id' => $id,
        'name' => [1 => 'Spider-Man', 2 => 'Iron Man', 21 => 'Captain Marvel', 41 => 'Watcher'][$id] ?? "Hero {$id}",
        'description' => 'A synthetic character for integrated discovery.',
    ], range(1, 41));

    if (str_ends_with($path, '/characters')) {
        $prefix = strtolower($parameters['nameStartsWith'] ?? '');
        $records = array_values(array_filter($characters, static fn (array $record) => str_starts_with(strtolower($record['name']), $prefix)));
    } elseif (preg_match('~/characters/([0-9]+)$~', $path, $matches)) {
        $records = array_values(array_filter($characters, static fn (array $record) => $record['id'] === (int) $matches[1]));
    } elseif (str_ends_with($path, '/stories')) {
        $records = array_map(static fn (int $id) => [
            'id' => $id, 'title' => [101 => 'Origin of a hero', 111 => 'A new beginning'][$id] ?? 'Hero chapter '.($id - 100),
            'type' => 'story', 'comics' => ['available' => 21],
        ], range(101, 111));
    } elseif (str_ends_with($path, '/comics')) {
        $records = array_map(static fn (int $issue) => [
            'id' => 1000 + $issue, 'title' => "Amazing Spider-Man #{$issue}", 'format' => 'Comic',
            'description' => 'A synthetic comic for integrated discovery.',
            'dates' => [['type' => 'onsaleDate', 'date' => '2020-01-02T00:00:00-05:00']],
        ], range(1, 21));
    } else {
        throw new LogicException('Unexpected simulated catalog resource.');
    }

    $offset = (int) ($parameters['offset'] ?? 0);
    $limit = (int) ($parameters['limit'] ?? 20);
    $results = array_slice($records, $offset, $limit);

    return ['data' => ['offset' => $offset, 'limit' => $limit, 'total' => count($records), 'count' => count($results), 'results' => $results]];
};
