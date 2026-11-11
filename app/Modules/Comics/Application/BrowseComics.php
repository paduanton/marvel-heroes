<?php

namespace App\Modules\Comics\Application;

use App\Modules\Characters\Domain\CatalogPage;
use App\Shared\Cache\CatalogCacheMetadata;
use App\Shared\Catalog\CatalogSourceUnavailableException;
use App\Shared\Catalog\LocalCatalog;
use App\Shared\Metron\MetronCatalog;
use App\Shared\Metron\MetronClient;
use App\Shared\Metron\MetronUnavailable;

final readonly class BrowseComics
{
    public function __construct(
        private LocalCatalog $catalog,
        private MetronCatalog $metron,
        private CatalogCacheMetadata $metadata,
    ) {}

    public function search(string $query, int $page, int $perPage, ?string $source): CatalogPage
    {
        $query = mb_strtolower(trim($query));

        return $this->selectPage(
            $page,
            $perPage,
            $source,
            fn (int $offset) => $this->metron->issues($query, $offset, $perPage),
            fn (int $offset) => $this->catalog->issues($query, $offset, $perPage),
        );
    }

    private function selectPage(int $page, int $perPage, ?string $source, callable $live, callable $local): CatalogPage
    {
        $offset = ($page - 1) * $perPage;
        if ($source !== 'local' && $this->liveEnabled()) {
            try {
                $result = $live($offset);
                if ($result['total'] > 0 || $page !== 1 || $source === 'live') {
                    $this->metadata->recordSource('live');

                    return new CatalogPage($result['items'], $page, $perPage, $result['total']);
                }
            } catch (MetronUnavailable $exception) {
                if ($page !== 1 || $source === 'live') {
                    throw $exception;
                }
                $failure = $exception;
            }
        } elseif ($source === 'live') {
            throw new CatalogSourceUnavailableException;
        }

        $this->metadata->reset();
        $result = $local($offset);
        if ($result['total'] === 0 && isset($failure)) {
            throw $failure;
        }

        return new CatalogPage($result['items'], $page, $perPage, $result['total']);
    }

    /** @return array<string, mixed>|null */
    public function detail(int $comicId): ?array
    {
        if (MetronCatalog::owns($comicId) && $this->liveEnabled()) {
            $result = $this->metron->issue($comicId);
            $this->metadata->recordSource('live');

            return $result;
        }

        return $this->catalog->issue($comicId);
    }

    public function forCharacter(int $characterId, int $page, int $perPage, ?string $source): CatalogPage
    {
        $gcdId = $this->catalog->characterGcdId($characterId);

        return $this->selectPage(
            $page,
            $perPage,
            $source,
            fn (int $offset) => $this->metron->characterIssues($gcdId, $offset, $perPage),
            fn (int $offset) => $this->catalog->characterComics($characterId, $offset, $perPage),
        );
    }

    private function liveEnabled(): bool
    {
        return config('catalog.provider') === 'metron' && MetronClient::configured();
    }
}
