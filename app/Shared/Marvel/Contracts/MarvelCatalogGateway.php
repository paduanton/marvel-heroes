<?php

namespace App\Shared\Marvel\Contracts;

interface MarvelCatalogGateway
{
    /** @return array{items: array<int, array<string, mixed>>, total: int} */
    public function characters(string $query, int $offset, int $limit): array;

    /** @return array<string, mixed>|null */
    public function character(int $characterId): ?array;

    /** @return array{items: array<int, array<string, mixed>>, total: int} */
    public function stories(int $characterId, int $offset, int $limit): array;

    /** @return array{items: array<int, array<string, mixed>>, total: int} */
    public function comics(int $storyId, int $offset, int $limit): array;
}
