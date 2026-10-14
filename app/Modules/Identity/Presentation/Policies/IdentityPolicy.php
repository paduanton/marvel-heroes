<?php

namespace App\Modules\Identity\Presentation\Policies;

use App\User;

final class IdentityPolicy
{
    public function view(User $actor, User $identity): bool
    {
        return $actor->is($identity);
    }
}
