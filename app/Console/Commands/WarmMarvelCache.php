<?php

namespace App\Console\Commands;

use App\Modules\Characters\Application\ListCharacters;
use App\Shared\Cache\CatalogCacheMetadata;
use App\Shared\Marvel\Exceptions\MarvelBudgetExhaustedException;
use App\Shared\Marvel\Exceptions\MarvelRefreshInProgressException;
use App\Shared\Marvel\Exceptions\MarvelUnavailableException;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Validator;

final class WarmMarvelCache extends Command
{
    protected $signature = 'marvel:cache:warm
        {--query=* : Replace the configured warm queries}
        {--dry-run : Preview queries without upstream requests or cache changes}';

    protected $description = 'Warm configured Marvel character catalog queries.';

    public function handle(ListCharacters $characters, CatalogCacheMetadata $metadata): int
    {
        $queries = $this->option('query') ?: config('marvel.warm_queries');
        if (is_array($queries)) {
            $queries = array_map(static fn (mixed $query): mixed => is_string($query) ? mb_strtolower(trim($query)) : $query, $queries);
        }
        $validation = Validator::make(['queries' => $queries], [
            'queries' => ['present', 'array'],
            'queries.*' => ['present', 'string', 'min:2', 'max:100'],
        ]);
        if ($validation->fails()) {
            $this->components->error('Warmup requires empty queries or prefixes between 2 and 100 characters. No requests were made.');

            return self::INVALID;
        }

        $queries = array_values(array_unique($queries));
        if ($queries === []) {
            $this->components->info('No warmup queries configured.');

            return self::SUCCESS;
        }
        if ($this->option('dry-run')) {
            foreach ($queries as $query) {
                $this->components->info($query === '' ? 'Planned initial character catalog.' : "Planned character query: {$query}");
            }
            $this->components->info('Dry run: '.count($queries).' unique queries; no upstream requests or cache changes.');

            return self::SUCCESS;
        }

        $fresh = 0;
        $stale = 0;
        $failed = 0;
        foreach ($queries as $query) {
            $label = $query === '' ? 'initial character catalog' : "character query: {$query}";
            $metadata->record(false);
            try {
                $characters->handle($query, 1, 20);
            } catch (MarvelBudgetExhaustedException|MarvelRefreshInProgressException|MarvelUnavailableException $exception) {
                $failed++;
                $code = match (true) {
                    $exception instanceof MarvelBudgetExhaustedException => 'upstream-budget-exhausted',
                    $exception instanceof MarvelRefreshInProgressException => 'cache-refresh-in-progress',
                    default => 'upstream-unavailable',
                };
                $this->components->error("Could not warm {$label} ({$code}).");

                continue;
            }
            if ($metadata->state() === 'stale') {
                $stale++;
                $this->components->warn("Stale cache kept for {$label}; refresh was not completed.");

                continue;
            }
            $fresh++;
            $this->components->info($query === '' ? 'Warmed initial character catalog.' : "Warmed character query: {$query}");
        }
        $this->components->info("Warmup finished: {$fresh} fresh, {$stale} stale, {$failed} failed.");

        return $failed === 0 ? self::SUCCESS : self::FAILURE;
    }
}
