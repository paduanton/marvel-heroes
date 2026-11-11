<?php

namespace App\Shared\Metron;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\RequestException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

final readonly class MetronClient
{
    private const BASE_URL = 'https://metron.cloud/api/';

    public function __construct(private MetronBudget $budget) {}

    public static function configured(): bool
    {
        $token = config('catalog.metron.token');

        return is_string($token) && preg_match('/\A[A-Za-z0-9._~-]+\z/', $token) === 1;
    }

    /** @param array<string, int|string> $parameters */
    public function get(string $path, array $parameters = [], bool $allowNotFound = false): ?array
    {
        if (! self::configured()) {
            throw new MetronUnavailable;
        }

        $this->budget->reserve();
        try {
            $response = Http::acceptJson()
                ->withToken(config('catalog.metron.token'))
                ->connectTimeout(2)
                ->timeout(2.5)
                ->withoutRedirecting()
                ->get(self::BASE_URL.$path, $parameters);
        } catch (ConnectionException|RequestException) {
            Log::warning('metron.transfer_failed');

            throw new MetronUnavailable;
        }

        Log::debug('metron.request_completed', ['status' => $response->status()]);
        $this->budget->observe($response);
        if ($allowNotFound && $response->notFound()) {
            return null;
        }

        $payload = $response->successful() ? $response->json() : null;
        if (! is_array($payload)) {
            throw new MetronUnavailable(budgetExhausted: $response->status() === 429);
        }

        return $payload;
    }
}
