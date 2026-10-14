<?php

namespace App\Modules\Identity\Presentation\Controllers;

use App\Modules\Identity\Presentation\Resources\IdentityResource;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

final class CurrentIdentityController
{
    public function __invoke(Request $request): IdentityResource
    {
        Gate::authorize('view', $request->user());

        return new IdentityResource($request->user());
    }
}
