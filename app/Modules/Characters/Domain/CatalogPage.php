<?php

namespace App\Modules\Characters\Domain;

final readonly class CatalogPage
{
    /** @param array<int, array<string, mixed>> $items */
    public function __construct(
        public array $items,
        public int $page,
        public int $perPage,
        public int $total,
    ) {}

    /** @return array{page: int, per_page: int, total: int} */
    public function meta(): array
    {
        return ['page' => $this->page, 'per_page' => $this->perPage, 'total' => $this->total];
    }
}
