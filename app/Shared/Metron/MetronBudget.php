<?php

namespace App\Shared\Metron;

use Illuminate\Contracts\Cache\LockTimeoutException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

final class MetronBudget
{
    private const KEY = 'metron:v1:account';

    public function reserve(): void
    {
        try {
            Cache::lock(self::KEY.':lock', 5)->block(1, function (): void {
                $now = now()->timestamp;
                $this->checkCooldown($now);

                $key = self::KEY.':timestamps';
                $timestamps = array_values(array_filter(Cache::get($key, []), fn (int $at): bool => $at > $now - 86400));
                $burst = count(array_filter($timestamps, fn (int $at): bool => $at > $now - 60));
                $dailyLimit = max(1, min(4000, (int) config('catalog.metron.requests_per_day')));
                $burstLimit = max(1, min(15, (int) config('catalog.metron.requests_per_minute')));
                if ($burst >= $burstLimit || count($timestamps) >= $dailyLimit) {
                    throw new MetronUnavailable(budgetExhausted: true);
                }

                $timestamps[] = $now;
                if (! Cache::put($key, $timestamps, 86400)) {
                    throw new MetronUnavailable(budgetExhausted: true);
                }

                Log::debug('metron.budget_reserved', [
                    'burst_remaining' => $burstLimit - $burst - 1,
                    'daily_remaining' => $dailyLimit - count($timestamps),
                ]);
            });
        } catch (LockTimeoutException) {
            throw new MetronUnavailable(budgetExhausted: true);
        }
    }

    public function observe(Response $response): void
    {
        $now = now()->timestamp;
        $seconds = $response->status() === 429
            ? ($this->number($response->header('Retry-After')) ?? 60)
            : 0;

        foreach (['Burst', 'Sustained'] as $scope) {
            if ($response->header("X-RateLimit-{$scope}-Remaining") === '0') {
                $reset = $this->number($response->header("X-RateLimit-{$scope}-Reset"));
                $seconds = max($seconds, $reset === null ? 60 : $reset - $now);
            }
        }

        if ($seconds > 0 || $response->status() === 429) {
            $seconds = max(1, min(86400, $seconds));
            try {
                Cache::lock(self::KEY.':lock', 5)->block(1, function () use ($now, $seconds): void {
                    $key = self::KEY.':cooldown';
                    $until = max($now + $seconds, (int) Cache::get($key, 0));
                    if (! Cache::put($key, $until, max(1, $until - now()->timestamp))) {
                        throw new MetronUnavailable(budgetExhausted: true);
                    }
                });
            } catch (LockTimeoutException) {
                throw new MetronUnavailable(budgetExhausted: true);
            }
        }
    }

    private function checkCooldown(int $now): void
    {
        if ((int) Cache::get(self::KEY.':cooldown', 0) > $now) {
            throw new MetronUnavailable(budgetExhausted: true);
        }
    }

    private function number(string $value): ?int
    {
        return ctype_digit($value) && strlen($value) <= 12 ? (int) $value : null;
    }
}
