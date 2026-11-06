<?php

namespace App\Shared\Cache;

final class CatalogCacheMetadata
{
    private bool $stale = false;

    private ?string $source = null;

    public function reset(): void
    {
        $this->stale = false;
        $this->source = null;
    }

    public function record(bool $stale): void
    {
        $this->stale = $stale;
    }

    public function state(): string
    {
        return $this->stale ? 'stale' : 'fresh';
    }

    public function recordSource(string $source): void
    {
        $this->source = $source;
    }

    public function source(): ?string
    {
        return $this->source;
    }
}
