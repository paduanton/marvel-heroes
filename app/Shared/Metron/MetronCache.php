<?php

namespace App\Shared\Metron;

use App\Shared\Cache\CatalogCacheMetadata;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

final readonly class MetronCache
{
    public function __construct(private CatalogCacheMetadata $metadata) {}

    public function remember(string $resource, array $parameters, callable $load): mixed
    {
        ksort($parameters);
        $key = 'metron:v1:'.$resource.':'.hash('sha256', json_encode($parameters, JSON_THROW_ON_ERROR));
        $entry = Cache::get($key);
        if ($this->fresh($entry)) {
            Log::debug('metron.cache_hit', ['resource' => $resource]);

            return $entry['value'];
        }

        Log::debug('metron.cache_miss', ['resource' => $resource]);
        $lock = Cache::lock($key.':lock', 15);
        try {
            // Keep serving the existing entry if another worker is refreshing it.
            if ($entry !== null && ! $lock->get()) {
                Log::debug('metron.cache_lock_contended', ['resource' => $resource]);

                return $this->stale($entry);
            }
            if ($entry === null) {
                $lock->block(1);
            }

            $entry = Cache::get($key);
            if ($this->fresh($entry)) {
                return $entry['value'];
            }

            try {
                $value = $load();
            } catch (MetronUnavailable $exception) {
                if ($entry !== null) {
                    Log::info('metron.cache_stale', ['resource' => $resource]);

                    return $this->stale($entry);
                }

                throw $exception;
            }

            $negative = $value === null || (is_array($value) && ($value['total'] ?? null) === 0);
            Cache::put($key, [
                'value' => $value,
                'fresh_until' => now()->timestamp + ($negative ? 900 : 30 * 86400),
                'stale_until' => now()->timestamp + ($negative ? 900 : 180 * 86400),
            ], $negative ? 900 : 180 * 86400);

            return $value;
        } catch (LockTimeoutException) {
            Log::debug('metron.cache_lock_contended', ['resource' => $resource]);

            throw new MetronUnavailable(budgetExhausted: true);
        } finally {
            $lock->release();
        }
    }

    private function fresh(?array $entry): bool
    {
        return $entry !== null && $entry['fresh_until'] > now()->timestamp;
    }

    private function stale(array $entry): mixed
    {
        if ($entry['stale_until'] <= now()->timestamp) {
            throw new MetronUnavailable;
        }

        $this->metadata->record(true);

        return $entry['value'];
    }
}
