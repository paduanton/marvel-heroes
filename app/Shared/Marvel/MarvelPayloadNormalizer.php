<?php

namespace App\Shared\Marvel;

final class MarvelPayloadNormalizer
{
    /** @param array<string, mixed> $item @return array<string, mixed> */
    public function character(array $item): array
    {
        return [
            'id' => (int) ($item['id'] ?? 0),
            'name' => (string) ($item['name'] ?? ''),
            'description' => $this->nullableString($item['description'] ?? null),
            'modified_at' => $this->nullableString($item['modified'] ?? null),
            'image_url' => $this->imageUrl($item['thumbnail'] ?? []),
        ];
    }

    /** @param array<string, mixed> $item @return array<string, mixed> */
    public function story(array $item): array
    {
        return [
            'id' => (int) ($item['id'] ?? 0),
            'title' => (string) ($item['title'] ?? ''),
            'type' => $this->nullableString($item['type'] ?? null),
            'modified_at' => $this->nullableString($item['modified'] ?? null),
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
            'id' => (int) ($item['id'] ?? 0),
            'digital_id' => (int) ($item['digitalId'] ?? 0) ?: null,
            'title' => (string) ($item['title'] ?? ''),
            'description' => $this->nullableString($item['description'] ?? null),
            'format' => $this->nullableString($item['format'] ?? null),
            'modified_at' => $this->nullableString($item['modified'] ?? null),
            'on_sale_at' => $this->dateByType($item, 'onsaleDate'),
            'digital_price' => $this->priceByType($item, 'digitalPurchasePrice'),
            'image_url' => $this->imageUrl($item['thumbnail'] ?? []),
        ];
    }

    /** @param array<string, mixed> $thumbnail */
    private function imageUrl(array $thumbnail): ?string
    {
        $path = $thumbnail['path'] ?? null;
        $extension = $thumbnail['extension'] ?? null;
        if (! is_string($path) || ! is_string($extension) || str_contains($path, 'image_not_available')) {
            return null;
        }

        return sprintf('%s/portrait_uncanny.%s', $path, $extension);
    }

    /** @param array<string, mixed> $item */
    private function dateByType(array $item, string $type): ?string
    {
        foreach (($item['dates'] ?? []) as $date) {
            if (($date['type'] ?? null) === $type) {
                return $this->nullableString($date['date'] ?? null);
            }
        }

        return null;
    }

    /** @param array<string, mixed> $item */
    private function priceByType(array $item, string $type): ?float
    {
        foreach (($item['prices'] ?? []) as $price) {
            if (($price['type'] ?? null) === $type && is_numeric($price['price'] ?? null)) {
                return (float) $price['price'];
            }
        }

        return null;
    }

    private function nullableString(mixed $value): ?string
    {
        return is_string($value) && trim($value) !== '' ? trim($value) : null;
    }
}
