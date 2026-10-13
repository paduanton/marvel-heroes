<?php

namespace App\Shared\Cache;

final class CatalogCacheMetadata
{
    private bool $stale = false;

    public function record(bool $stale): void
    {
        $this->stale = $stale;
    }

    public function state(): string
    {
        return $this->stale ? 'stale' : 'fresh';
    }
}
