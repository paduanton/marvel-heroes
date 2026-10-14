<?php

namespace App\Modules\Identity\Application;

use App\User;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

final class RegisterIdentity
{
    public function handle(string $name, string $email, string $password): User
    {
        try {
            $user = User::create(['name' => $name, 'email' => $email, 'password' => Hash::make($password)]);
        } catch (UniqueConstraintViolationException) {
            throw ValidationException::withMessages(['email' => ['This email address is already registered.']]);
        }
        Auth::guard('web')->login($user);

        return $user;
    }
}
