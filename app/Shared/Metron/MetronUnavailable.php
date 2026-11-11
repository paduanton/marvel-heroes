<?php

namespace App\Shared\Metron;

use RuntimeException;

final class MetronUnavailable extends RuntimeException
{
    public function __construct(public readonly bool $budgetExhausted = false)
    {
        parent::__construct('The Metron catalog is temporarily unavailable.');
    }
}
