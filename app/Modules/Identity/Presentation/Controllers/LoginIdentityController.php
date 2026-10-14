<?php

namespace App\Modules\Identity\Presentation\Controllers;

use App\Modules\Identity\Application\LoginIdentity;
use App\Modules\Identity\Presentation\Requests\LoginIdentityRequest;
use App\Modules\Identity\Presentation\Resources\IdentityResource;

final class LoginIdentityController
{
    public function __invoke(LoginIdentityRequest $request, LoginIdentity $action): IdentityResource
    {
        $input = $request->validated();
        $user = $action->handle($input['email'], $input['password']);
        $request->session()->regenerate();

        return new IdentityResource($user);
    }
}
