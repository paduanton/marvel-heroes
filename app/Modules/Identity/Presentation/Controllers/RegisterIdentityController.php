<?php

namespace App\Modules\Identity\Presentation\Controllers;

use App\Modules\Identity\Application\RegisterIdentity;
use App\Modules\Identity\Presentation\Requests\RegisterIdentityRequest;
use App\Modules\Identity\Presentation\Resources\IdentityResource;
use Illuminate\Http\JsonResponse;

final class RegisterIdentityController
{
    public function __invoke(RegisterIdentityRequest $request, RegisterIdentity $action): JsonResponse
    {
        $input = $request->validated();
        $user = $action->handle($input['name'], $input['email'], $input['password']);
        $request->session()->regenerate();

        return (new IdentityResource($user))->response()->setStatusCode(201);
    }
}
