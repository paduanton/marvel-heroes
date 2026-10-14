<?php

namespace App\Modules\Characters\Presentation\Requests;

use App\Modules\Characters\Domain\CatalogLimits;

trait PaginatesCatalog
{
    /** @return array<string, mixed> */
    protected function paginationRules(int $maximumPerPage): array
    {
        return [
            'page' => ['sometimes', 'integer', 'min:1', 'max:'.CatalogLimits::MAX_PAGE],
            'per_page' => ['sometimes', 'integer', 'min:1', "max:{$maximumPerPage}"],
        ];
    }

    public function page(): int
    {
        return (int) $this->validated('page', 1);
    }

    public function perPage(int $default): int
    {
        return (int) $this->validated('per_page', $default);
    }
}
