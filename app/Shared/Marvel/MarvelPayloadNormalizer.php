<?php

namespace App\Shared\Marvel;

use App\Shared\Marvel\Exceptions\MarvelUnavailableException;
use DateTimeImmutable;

final class MarvelPayloadNormalizer
{
    /** @param array<string, mixed> $item @return array<string, mixed> */
    public function character(array $item): array
    {
        return [
            'id' => $this->recordId($item['id'] ?? null),
            'name' => $this->recordLabel($item['name'] ?? null),
            'description' => $this->nullableString($item['description'] ?? null),
            'modified_at' => $this->nullableDate($item['modified'] ?? null),
            'image_url' => $this->imageUrl($item['thumbnail'] ?? []),
        ];
    }

    /** @param array<string, mixed> $item @return array<string, mixed> */
    public function story(array $item): array
    {
        return [
            'id' => $this->recordId($item['id'] ?? null),
            'title' => $this->recordLabel($item['title'] ?? null),
            'type' => $this->nullableString($item['type'] ?? null),
            'modified_at' => $this->nullableDate($item['modified'] ?? null),
            'counts' => [
                'creators' => (int) data_get($item, 'creators.available', 0),
                'series' => (int) data_get($item, 'series.available', 0),
                'characters' => (int) data_get($item, 'characters.available', 0),
                'comics' => (int) data_get($item, 'comics.available', 0),
                'events' => (int) data_get($item, 'events.available', 0),
            ],
        ];
    }

    /** @param array<string, mixed> $item @return array<string, mixed> */
    public function comic(array $item): array
    {
        return [
            'id' => $this->recordId($item['id'] ?? null),
            'digital_id' => (int) ($item['digitalId'] ?? 0) ?: null,
            'title' => $this->recordLabel($item['title'] ?? null),
            'description' => $this->nullableString($item['description'] ?? null),
            'format' => $this->nullableString($item['format'] ?? null),
            'modified_at' => $this->nullableDate($item['modified'] ?? null),
            'on_sale_at' => $this->dateByType($item, 'onsaleDate'),
            'digital_price' => $this->priceByType($item, 'digitalPurchasePrice'),
            'image_url' => $this->imageUrl($item['thumbnail'] ?? []),
        ];
    }

    private function recordId(mixed $value): int
    {
        if (! is_int($value) || $value < 1) {
            throw new MarvelUnavailableException('Marvel API returned an invalid record ID.');
        }

        return $value;
    }

    private function recordLabel(mixed $value): string
    {
        if (! is_string($value) || trim($value) === '') {
            throw new MarvelUnavailableException('Marvel API returned an invalid record name or title.');
        }

        return $value;
    }

    private function imageUrl(mixed $thumbnail): ?string
    {
        if (! is_array($thumbnail)) {
            return null;
        }

        $path = $thumbnail['path'] ?? null;
        $extension = $thumbnail['extension'] ?? null;
        if (! is_string($path) || ! is_string($extension)
            || trim($path) === '' || trim($extension) === ''
            || str_contains($path, 'image_not_available')) {
            return null;
        }

        return sprintf('%s/portrait_uncanny.%s', $path, $extension);
    }

    /** @param array<string, mixed> $item */
    private function dateByType(array $item, string $type): ?string
    {
        $dates = $item['dates'] ?? [];
        if (! is_array($dates)) {
            return null;
        }

        foreach ($dates as $date) {
            if (is_array($date) && ($date['type'] ?? null) === $type) {
                return $this->nullableDate($date['date'] ?? null);
            }
        }

        return null;
    }

    /** @param array<string, mixed> $item */
    private function priceByType(array $item, string $type): ?float
    {
        $prices = $item['prices'] ?? [];
        if (! is_array($prices)) {
            return null;
        }

        foreach ($prices as $price) {
            if (is_array($price) && ($price['type'] ?? null) === $type && is_numeric($price['price'] ?? null)) {
                $amount = (float) $price['price'];
                if (is_finite($amount)) {
                    return $amount;
                }
            }
        }

        return null;
    }

    private function nullableDate(mixed $value): ?string
    {
        $value = $this->nullableString($value);
        $pattern = '/\A(?<timestamp>[0-9]{4}-[0-9]{2}-[0-9]{2}[Tt][0-9]{2}:[0-9]{2}:[0-9]{2})(?<fraction>\.[0-9]+)?(?<offset>[Zz]|[+-](?:[01][0-9]|2[0-3]):?[0-5][0-9])\z/';
        if ($value === null || preg_match($pattern, $value, $parts) !== 1) {
            return null;
        }

        $timestamp = strtoupper($parts['timestamp']);
        $offset = strtoupper($parts['offset']);
        if (strlen($offset) === 5) {
            $offset = substr($offset, 0, 3).':'.substr($offset, 3);
        }

        // Validate calendar and clock values without rounding fractional seconds.
        $date = DateTimeImmutable::createFromFormat('!Y-m-d\TH:i:sP', $timestamp.$offset);
        if ($date === false || DateTimeImmutable::getLastErrors() !== false) {
            return null;
        }

        return $timestamp.$parts['fraction'].$offset;
    }

    private function nullableString(mixed $value): ?string
    {
        return is_string($value) && trim($value) !== '' ? trim($value) : null;
    }
}
