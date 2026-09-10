<?php

namespace App\Modules\Characters\Application;

use App\Shared\Marvel\Contracts\MarvelCatalogGateway;

final readonly class GetCharacter
{
    public function __construct(private MarvelCatalogGateway $catalog) {}

    /** @return array<string, mixed>|null */
    public function handle(int $characterId): ?array
    {
        return $this->catalog->character($characterId);
    }
}
