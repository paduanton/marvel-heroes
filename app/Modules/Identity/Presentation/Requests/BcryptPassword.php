<?php

namespace App\Modules\Identity\Presentation\Requests;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

final class BcryptPassword implements ValidationRule
{
    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (is_string($value) && (strlen($value) > 72 || str_contains($value, "\0"))) {
            $fail('The password must not exceed 72 bytes or contain null characters.');
        }
    }
}
