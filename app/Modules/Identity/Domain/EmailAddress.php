<?php

namespace App\Modules\Identity\Domain;

final class EmailAddress
{
    public static function normalize(string $email): string
    {
        return mb_strtolower(trim($email));
    }
}
