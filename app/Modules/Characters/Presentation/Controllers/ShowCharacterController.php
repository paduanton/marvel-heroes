<?php

namespace App\Modules\Characters\Presentation\Controllers;

use App\Modules\Characters\Application\GetCharacter;
use App\Modules\Characters\Presentation\Resources\CharacterResource;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

final class ShowCharacterController
{
    public function __invoke(int $characterId, GetCharacter $action): CharacterResource
    {
        $character = $action->handle($characterId);
        if ($character === null) {
            throw new NotFoundHttpException('Character not found.');
        }

        return new CharacterResource($character);
    }
}
