<?php

namespace App\Console\Commands;

use App\Modules\Characters\Application\ListCharacters;
use Illuminate\Console\Command;

final class WarmMarvelCache extends Command
{
    protected $signature = 'marvel:cache:warm {--query=* : Replace the configured warm queries}';

    protected $description = 'Warm configured Marvel character catalog queries.';

    public function handle(ListCharacters $characters): int
    {
        $queries = $this->option('query') ?: config('marvel.warm_queries');
        foreach (array_unique(array_filter($queries)) as $query) {
            $characters->handle((string) $query, 1, 20);
            $this->components->info("Warmed character query: {$query}");
        }

        return self::SUCCESS;
    }
}
