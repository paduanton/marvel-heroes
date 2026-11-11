<?php

namespace App\Shared\Metron;

use App\Modules\Characters\Domain\CatalogLimits;

final readonly class MetronCatalog
{
    private const ID_BASE = 2_000_000_000_000;

    private const ID_RANGE = 1_000_000_000_000;

    // The provider's DRF page size is fixed; our page can span at most two of its pages.
    private const PAGE_SIZE = 100;

    public function __construct(private MetronClient $client, private MetronCache $cache) {}

    public function issues(string $query, int $offset, int $limit): array
    {
        $filters = ['publisher_id' => $this->publisherId()];
        if ($query !== '') {
            $filters['series_name'] = $query;
        }

        return $this->issuesPage($filters, $offset, $limit);
    }

    public function characterIssues(int $gcdId, int $offset, int $limit): array
    {
        $character = $this->cache->remember('character-cross-reference', ['gcd_id' => $gcdId], function () use ($gcdId): ?int {
            $payload = $this->client->get('character/', ['gcd_id' => $gcdId]);
            $results = $this->results($payload);
            $count = $payload['count'] ?? null;
            if (! is_int($count) || $count < 0 || count($results) !== min(self::PAGE_SIZE, $count)) {
                throw new MetronUnavailable;
            }

            return $count === 1 ? self::id($results[0]['id'] ?? null) : null;
        });

        if ($character === null) {
            return ['items' => [], 'total' => 0];
        }

        return $this->issuesPage(['publisher_id' => $this->publisherId(), 'character_id' => $character], $offset, $limit);
    }

    public static function owns(int $id): bool
    {
        return $id > self::ID_BASE && $id < self::ID_BASE + self::ID_RANGE;
    }

    public function issue(int $id): ?array
    {
        $upstreamId = $id - self::ID_BASE;
        $record = $this->cache->remember('issue', ['id' => $upstreamId], function () use ($upstreamId): ?array {
            $payload = $this->client->get("issue/{$upstreamId}/", allowNotFound: true);
            if ($payload === null) {
                return null;
            }
            if (self::id($payload['id'] ?? null) !== $upstreamId) {
                throw new MetronUnavailable;
            }

            return [
                'comic' => $this->comic($payload),
                'publisher_id' => self::id($payload['publisher']['id'] ?? null),
            ];
        });
        if ($record === null) {
            return null;
        }

        return $record['publisher_id'] === $this->publisherId() ? $record['comic'] : null;
    }

    private function publisherId(): int
    {
        return $this->cache->remember('marvel-publisher', [], function (): int {
            $payload = $this->client->get('publisher/', ['cv_id' => 31]);
            if (($payload['count'] ?? null) !== 1 || count($this->results($payload)) !== 1) {
                throw new MetronUnavailable;
            }

            return self::id($payload['results'][0]['id'] ?? null);
        });
    }

    private function issuesPage(array $filters, int $offset, int $limit): array
    {
        $first = $this->providerPage($filters, 1);
        $total = $first['total'];
        if ($offset >= $total) {
            return ['items' => [], 'total' => $total];
        }

        // Translate our pagination without following URLs from the provider.
        $width = self::PAGE_SIZE;
        $length = min($limit, $total - $offset);
        $items = [];
        for ($start = $offset; count($items) < $length; $start += count($part)) {
            $number = intdiv($start, $width) + 1;
            $page = $number === 1 ? $first : $this->providerPage($filters, $number);
            if ($page['total'] !== $total) {
                throw new MetronUnavailable;
            }
            $part = array_slice($page['items'], $start % $width, $length - count($items));
            array_push($items, ...$part);
        }

        if (count(array_unique(array_column($items, 'id'))) !== count($items)) {
            throw new MetronUnavailable;
        }

        return ['items' => $items, 'total' => $total];
    }

    private function providerPage(array $filters, int $page): array
    {
        $filters['page'] = $page;

        return $this->cache->remember('issue-page', $filters, function () use ($filters, $page): array {
            $payload = $this->client->get('issue/', $filters);
            $total = $payload['count'] ?? null;
            $results = $this->results($payload);
            $next = $payload['next'] ?? null;
            $offset = ($page - 1) * self::PAGE_SIZE;
            if (! is_int($total) || $total < 0 || $total > CatalogLimits::MAX_ID
                || count($results) !== min(self::PAGE_SIZE, max(0, $total - $offset))
                || ! array_key_exists('next', $payload)
                || ($next !== null && ! is_string($next))
                || ($next === null) !== ($offset + self::PAGE_SIZE >= $total)) {
                throw new MetronUnavailable;
            }

            $items = [];
            foreach ($results as $record) {
                if (! is_array($record)) {
                    throw new MetronUnavailable;
                }
                $items[] = $this->comic($record);
            }
            if (count(array_unique(array_column($items, 'id'))) !== count($items)) {
                throw new MetronUnavailable;
            }

            return ['items' => $items, 'total' => $total];
        });
    }

    private function results(array $payload): array
    {
        $results = $payload['results'] ?? null;
        if (! is_array($results) || ! array_is_list($results)) {
            throw new MetronUnavailable;
        }

        return $results;
    }

    private function comic(array $record): array
    {
        $title = $record['issue'] ?? null;
        if (! is_string($title) || trim($title) === '') {
            // The detail serializer provides the components, not the formatted list title.
            $series = $record['series']['name'] ?? null;
            $number = $record['number'] ?? null;
            if (! is_string($series) || trim($series) === '' || ! is_string($number) || trim($number) === '') {
                throw new MetronUnavailable;
            }

            $year = $record['series']['year_began'] ?? null;
            $title = trim($series).(is_int($year) ? " ({$year})" : '').' #'.trim($number);
        }
        $date = $record['store_date'] ?? null;
        $validDate = is_string($date)
            && preg_match('/\A(\d{4})-(\d{2})-(\d{2})\z/', $date, $parts)
            && checkdate((int) $parts[2], (int) $parts[3], (int) $parts[1]);

        return [
            'id' => self::ID_BASE + self::id($record['id'] ?? null),
            'title' => trim($title),
            'digital_id' => null,
            'description' => null,
            'format' => null,
            'modified_at' => null,
            'on_sale_at' => $validDate ? $date.'T00:00:00Z' : null,
            'digital_price' => null,
            'image_url' => null,
        ];
    }

    private static function id(mixed $value): int
    {
        if (! is_int($value) || $value < 1 || $value >= self::ID_RANGE) {
            throw new MetronUnavailable;
        }

        return $value;
    }
}
