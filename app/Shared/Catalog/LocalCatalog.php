<?php

namespace App\Shared\Catalog;

use App\Shared\Cache\CatalogCacheMetadata;
use App\Shared\Marvel\Contracts\MarvelCatalogGateway;
use Illuminate\Support\Facades\File;
use LogicException;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

final class LocalCatalog implements MarvelCatalogGateway
{
    private const ID_BASE = 3_000_000_000_000;

    private array $characters = [];

    private array $issues = [];

    private array $storiesByCharacter = [];

    private array $issuesByStory = [];

    private array $issuesByCharacter = [];

    public function __construct(private readonly ?CatalogCacheMetadata $metadata = null)
    {
        $snapshot = json_decode(File::get(resource_path('catalog/gcd-v1.json')), true, flags: JSON_THROW_ON_ERROR);
        if (($snapshot['version'] ?? null) !== 1) {
            throw new LogicException('Unsupported local catalog snapshot.');
        }

        foreach ($snapshot['characters'] as $record) {
            $id = self::ID_BASE + $record['id'];
            $this->characters[$id] = [
                'id' => $id,
                'name' => $record['name'],
                'description' => null,
                'modified_at' => null,
                'image_url' => null,
            ];
        }
        uasort($this->characters, static fn (array $a, array $b): int => [$a['name'], $a['id']] <=> [$b['name'], $b['id']]);

        foreach ($snapshot['series'] as $series) {
            foreach ($series['issues'] as $number => $onSale) {
                $id = $this->issueId($series['id'], $number);
                $this->issues[$id] = [
                    'id' => $id,
                    'digital_id' => null,
                    'title' => "{$series['title']} ({$series['year']}) #{$number}",
                    'description' => null,
                    'format' => 'Comic',
                    'modified_at' => null,
                    'on_sale_at' => $onSale === null ? null : $onSale.'T00:00:00Z',
                    'digital_price' => null,
                    'image_url' => null,
                ];
            }
        }

        foreach ($snapshot['stories'] as $record) {
            $storyId = self::ID_BASE + $record['id'];
            $characterId = self::ID_BASE + $record['character_id'];
            $issueId = $this->issueId($record['series_id'], $record['issue']);
            if (! isset($this->characters[$characterId], $this->issues[$issueId])) {
                throw new LogicException('Invalid local catalog relationship.');
            }

            $this->storiesByCharacter[$characterId][] = [
                'id' => $storyId,
                'title' => $record['title'],
                'type' => 'comic story',
                'modified_at' => null,
                'counts' => ['creators' => 0, 'series' => 1, 'characters' => 1, 'comics' => 1, 'events' => 0],
            ];
            $this->issuesByStory[$storyId] = [$this->issues[$issueId]];
            $this->issuesByCharacter[$characterId][$issueId] = $this->issues[$issueId];
        }
    }

    public function characters(string $query, int $offset, int $limit): array
    {
        $query = mb_strtolower(trim($query));

        return $this->page(array_filter($this->characters, static fn (array $item): bool => str_starts_with(mb_strtolower($item['name']), $query)), $offset, $limit);
    }

    public function character(int $characterId): ?array
    {
        $this->metadata?->recordSource('local');

        return $this->characters[$characterId] ?? null;
    }

    public function stories(int $characterId, int $offset, int $limit): array
    {
        $this->requireCharacter($characterId);

        return $this->page($this->storiesByCharacter[$characterId] ?? [], $offset, $limit);
    }

    public function comics(int $storyId, int $offset, int $limit): array
    {
        return $this->page($this->issuesByStory[$storyId] ?? throw new NotFoundHttpException('Story not found.'), $offset, $limit);
    }

    public function issues(string $query, int $offset, int $limit): array
    {
        $query = mb_strtolower(trim($query));

        return $this->page(array_filter($this->issues, static fn (array $item): bool => str_contains(mb_strtolower($item['title']), $query)), $offset, $limit);
    }

    public function issue(int $comicId): ?array
    {
        $this->metadata?->recordSource('local');

        return $this->issues[$comicId] ?? null;
    }

    public function characterComics(int $characterId, int $offset, int $limit): array
    {
        $this->requireCharacter($characterId);

        return $this->page($this->issuesByCharacter[$characterId] ?? [], $offset, $limit);
    }

    public function characterGcdId(int $characterId): int
    {
        $this->requireCharacter($characterId);

        return $characterId - self::ID_BASE;
    }

    private function requireCharacter(int $characterId): void
    {
        if (! isset($this->characters[$characterId])) {
            throw new NotFoundHttpException('Character not found.');
        }
    }

    private function issueId(int $series, int $issue): int
    {
        return self::ID_BASE + $series * 1000 + $issue;
    }

    private function page(array $items, int $offset, int $limit): array
    {
        $this->metadata?->recordSource('local');

        return ['items' => array_slice(array_values($items), $offset, $limit), 'total' => count($items)];
    }
}
