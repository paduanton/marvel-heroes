<?php

namespace App\Shared\Cache;

use App\Shared\Marvel\Contracts\MarvelCatalogGateway;
use App\Shared\Marvel\Exceptions\MarvelBudgetExhaustedException;
use App\Shared\Marvel\Exceptions\MarvelRefreshInProgressException;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

final class CachedMarvelCatalogGateway implements MarvelCatalogGateway
{
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

        $lock = Cache::lock("{$key}:lock", 15);
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

    /** @template T @param array<string, mixed>|null $entry @param callable(): T $resolver @return T */
    private function refresh(string $key, string $resource, ?array $entry, callable $resolver): mixed
    {
        if (! $this->canCallUpstream()) {
            if ($this->isStale($entry)) {
                Log::warning('marvel.cache_stale_budget', ['resource' => $resource]);

                return $entry['value'];
            }

            throw new MarvelBudgetExhaustedException('The daily Marvel API budget has been exhausted.');
        }

        try {
            $value = $resolver();
        } catch (\Throwable $exception) {
            if ($this->isStale($entry)) {
                Log::warning('marvel.cache_stale_upstream', ['resource' => $resource, 'exception' => $exception::class]);

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

    private function canCallUpstream(): bool
    {
        $key = 'marvel:budget:timestamps';
        $lock = Cache::lock('marvel:budget:lock', 5);
        try {
            $lock->block(2);
            $now = now()->getTimestamp();
            $windowStart = $now - 86400;
            $storedTimestamps = Cache::get($key, []);
            $timestamps = array_values(array_filter(
                is_array($storedTimestamps) ? $storedTimestamps : [],
                static fn (mixed $timestamp): bool => is_int($timestamp) && $timestamp > $windowStart,
            ));

            if (count($timestamps) >= (int) config('marvel.daily_budget')) {
                Log::warning('marvel.upstream_budget_exhausted', ['used' => count($timestamps)]);

                return false;
            }

            $timestamps[] = $now;
            Cache::put($key, $timestamps, now()->addDay());
            Log::debug('marvel.upstream_budget_used', [
                'used' => count($timestamps),
                'remaining' => max(0, (int) config('marvel.daily_budget') - count($timestamps)),
            ]);

            return true;
        } catch (LockTimeoutException) {
            return false;
        } finally {
            optional($lock)->release();
        }
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
