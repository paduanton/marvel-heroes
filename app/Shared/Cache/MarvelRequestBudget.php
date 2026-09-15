<?php

namespace App\Shared\Cache;

use App\Shared\Marvel\Exceptions\MarvelBudgetExhaustedException;
use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

final class MarvelRequestBudget
{
    public const LOCK_WAIT_SECONDS = 2;

    public function reserve(): void
    {
        $key = 'marvel:budget:timestamps';
        $lock = Cache::lock('marvel:budget:lock', 5);

        try {
            $lock->block(self::LOCK_WAIT_SECONDS);
            $now = now()->getTimestamp();
            $windowStart = $now - 86400;
            $storedTimestamps = Cache::get($key, []);
            $timestamps = array_values(array_filter(
                is_array($storedTimestamps) ? $storedTimestamps : [],
                static fn (mixed $timestamp): bool => is_int($timestamp) && $timestamp > $windowStart,
            ));

            if (count($timestamps) >= (int) config('marvel.daily_budget')) {
                Log::warning('marvel.upstream_budget_exhausted', ['used' => count($timestamps)]);

                throw new MarvelBudgetExhaustedException('The daily Marvel API budget has been exhausted.');
            }

            $timestamps[] = $now;
            Cache::put($key, $timestamps, now()->addDay());
            Log::debug('marvel.upstream_budget_used', [
                'used' => count($timestamps),
                'remaining' => max(0, (int) config('marvel.daily_budget') - count($timestamps)),
            ]);
        } catch (LockTimeoutException) {
            throw new MarvelBudgetExhaustedException('The Marvel API budget could not be reserved.');
        } finally {
            $lock->release();
        }
    }
}
