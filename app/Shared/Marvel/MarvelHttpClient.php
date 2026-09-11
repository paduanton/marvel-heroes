<?php

namespace App\Shared\Marvel;

use App\Shared\Marvel\Contracts\MarvelCatalogGateway;
use App\Shared\Marvel\Exceptions\MarvelUnavailableException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

final class MarvelHttpClient implements MarvelCatalogGateway
{
    public function __construct(private readonly MarvelPayloadNormalizer $normalizer) {}

    public function characters(string $query, int $offset, int $limit): array
    {
        return $this->collection('characters', array_filter([
            'nameStartsWith' => $query !== '' ? $query : null,
            'offset' => $offset,
            'limit' => $limit,
            'orderBy' => 'name',
        ]), fn (array $item) => $this->normalizer->character($item));
    }

    public function character(int $characterId): ?array
    {
        $collection = $this->collection("characters/{$characterId}", [], fn (array $item) => $this->normalizer->character($item));

        return $collection['items'][0] ?? null;
    }

    public function stories(int $characterId, int $offset, int $limit): array
    {
        return $this->collection("characters/{$characterId}/stories", [
            'offset' => $offset,
            'limit' => $limit,
            'orderBy' => 'modified',
        ], fn (array $item) => $this->normalizer->story($item));
    }

    public function comics(int $storyId, int $offset, int $limit): array
    {
        return $this->collection("stories/{$storyId}/comics", [
            'offset' => $offset,
            'limit' => $limit,
            'orderBy' => '-onsaleDate',
        ], fn (array $item) => $this->normalizer->comic($item));
    }

    /** @param array<string, mixed> $query @param callable(array<string, mixed>): array<string, mixed> $normalizer */
    private function collection(string $path, array $query, callable $normalizer): array
    {
        try {
            Log::debug('marvel.upstream_call', ['path' => $path]);
            $response = Http::baseUrl((string) config('marvel.base_url'))
                ->acceptJson()
                ->connectTimeout((int) config('marvel.timeout_seconds'))
                ->timeout((int) config('marvel.timeout_seconds'))
                ->retry(
                    (int) config('marvel.retry_times'),
                    200,
                    fn ($exception, $request) => $exception instanceof ConnectionException,
                    throw: false,
                )
                ->get($path, array_merge($query, $this->signature()));
        } catch (ConnectionException $exception) {
            throw new MarvelUnavailableException('Marvel API connection failed.', previous: $exception);
        }

        if ($response->status() === 404) {
            return ['items' => [], 'total' => 0];
        }

        if (! $response->successful()) {
            Log::warning('marvel.upstream_failed', ['status' => $response->status(), 'path' => $path]);
            throw new MarvelUnavailableException('Marvel API returned an unsuccessful response.');
        }

        $data = $response->json('data', []);
        $results = is_array($data['results'] ?? null) ? $data['results'] : [];

        return [
            'items' => array_values(array_map($normalizer, $results)),
            'total' => (int) ($data['total'] ?? count($results)),
        ];
    }

    /** @return array<string, string> */
    private function signature(): array
    {
        $timestamp = (string) now()->getTimestamp();
        $publicKey = (string) config('marvel.public_key');
        $privateKey = (string) config('marvel.private_key');
        if ($publicKey === '' || $privateKey === '') {
            throw new MarvelUnavailableException('Marvel credentials are not configured.');
        }

        return ['ts' => $timestamp, 'apikey' => $publicKey, 'hash' => md5($timestamp.$privateKey.$publicKey)];
    }
}
