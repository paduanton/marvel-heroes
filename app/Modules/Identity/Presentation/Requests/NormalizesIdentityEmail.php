<?php

namespace App\Modules\Identity\Presentation\Requests;

use App\Modules\Identity\Domain\EmailAddress;

trait NormalizesIdentityEmail
{
    protected function prepareForValidation(): void
    {
        if (is_string($this->input('email'))) {
            $this->merge(['email' => EmailAddress::normalize($this->input('email'))]);
        }
    }
}
