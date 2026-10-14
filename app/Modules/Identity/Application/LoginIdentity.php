<?php

namespace App\Modules\Identity\Application;

use App\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

final class LoginIdentity
{
    public function handle(string $email, string $password): User
    {
        $guard = Auth::guard('web');
        if (! $guard->attempt(['email' => $email, 'password' => $password])) {
            throw ValidationException::withMessages(['email' => ['The supplied credentials are invalid.']]);
        }

        return $guard->user();
    }
}
