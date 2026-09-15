<?php

namespace App\Shared\Cache;

use App\Shared\Marvel\Contracts\MarvelCatalogGateway;
use App\Shared\Marvel\Exceptions\MarvelBudgetExhaustedException;
use App\Shared\Marvel\Exceptions\MarvelRefreshInProgressException;
use App\Shared\Marvel\MarvelHttpClient;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

final class CachedMarvelCatalogGateway implements MarvelCatalogGateway
{
    private const REFRESH_OVERHEAD_SECONDS = 5;

    public function __construct(private readonly MarvelCatalogGateway $upstream) {}

    public function characters(string $query, int $offset, int $limit): array
    {
        return $this->remember('characters', compact('query', 'offset', 'limit'), fn () => $this->upstream->characters($query, $offset, $limit));
    }

    public function character(int $characterId): ?array
    {
        return $this->remember('character', compact('characterId'), fn () => $this->upstream->character($characterId));
    }

    public function stories(int $characterId, int $offset, int $limit): array
    {
        return $this->remember('stories', compact('characterId', 'offset', 'limit'), fn () => $this->upstream->stories($characterId, $offset, $limit));
    }

    public function comics(int $storyId, int $offset, int $limit): array
    {
        return $this->remember('comics', compact('storyId', 'offset', 'limit'), fn () => $this->upstream->comics($storyId, $offset, $limit));
    }

    /** @template T @param array<string, mixed> $parameters @param callable(): T $resolver @return T */
    private function remember(string $resource, array $parameters, callable $resolver): mixed
    {
        $key = $this->key($resource, $parameters);
        $entry = Cache::get($key);

        if ($this->isFresh($entry)) {
            Log::debug('marvel.cache_hit', ['resource' => $resource]);

            return $entry['value'];
        }

        Log::debug('marvel.cache_miss', ['resource' => $resource]);

        $lock = Cache::lock("{$key}:lock", $this->refreshLockSeconds());
        try {
            $lock->block(2);
            $entry = Cache::get($key);
            if ($this->isFresh($entry)) {
                return $entry['value'];
            }

            return $this->refresh($key, $resource, $entry, $resolver);
        } catch (LockTimeoutException) {
            if ($this->isStale($entry)) {
                Log::info('marvel.cache_stale_lock', ['resource' => $resource]);

                return $entry['value'];
            }

            throw new MarvelRefreshInProgressException('A catalog response is currently being refreshed.');
        } finally {
            optional($lock)->release();
        }
    }

    private function refreshLockSeconds(): int
    {
        $attempts = max(1, (int) config('marvel.retry_times'));
        $timeout = (int) config('marvel.timeout_seconds');
        $retryDelay = ($attempts - 1) * MarvelHttpClient::RETRY_DELAY_MILLISECONDS / 1000;

        // Budget reservation precedes every HTTP attempt; allow time to normalize and cache the result.
        $requestWindow = $attempts * ($timeout + MarvelRequestBudget::LOCK_WAIT_SECONDS) + $retryDelay;

        return max(15, (int) ceil($requestWindow) + self::REFRESH_OVERHEAD_SECONDS);
    }

    /** @template T @param array<string, mixed>|null $entry @param callable(): T $resolver @return T */
    private function refresh(string $key, string $resource, ?array $entry, callable $resolver): mixed
    {
        try {
            $value = $resolver();
        } catch (\Throwable $exception) {
            if ($this->isStale($entry)) {
                $event = $exception instanceof MarvelBudgetExhaustedException
                    ? 'marvel.cache_stale_budget'
                    : 'marvel.cache_stale_upstream';
                Log::warning($event, ['resource' => $resource, 'exception' => $exception::class]);

                return $entry['value'];
            }
            throw $exception;
        }

        $freshUntil = now()->addDays((int) config('marvel.cache.fresh_days'));
        $staleUntil = now()->addDays((int) config('marvel.cache.stale_days'));
        Cache::put($key, ['value' => $value, 'fresh_until' => $freshUntil->getTimestamp(), 'stale_until' => $staleUntil->getTimestamp()], $staleUntil);
        Log::info('marvel.cache_refreshed', ['resource' => $resource]);

        return $value;
    }

    /** @param array<string, mixed>|mixed $entry */
    private function isFresh(mixed $entry): bool
    {
        return is_array($entry)
            && isset($entry['fresh_until'])
            && array_key_exists('value', $entry)
            && $entry['fresh_until'] >= now()->getTimestamp();
    }

    /** @param array<string, mixed>|mixed $entry */
    private function isStale(mixed $entry): bool
    {
        return is_array($entry)
            && isset($entry['stale_until'])
            && array_key_exists('value', $entry)
            && $entry['stale_until'] >= now()->getTimestamp();
    }

    /** @param array<string, mixed> $parameters */
    private function key(string $resource, array $parameters): string
    {
        ksort($parameters);

        return sprintf('marvel:v1:%s:%s', $resource, hash('sha256', json_encode($parameters, JSON_THROW_ON_ERROR)));
    }
}
