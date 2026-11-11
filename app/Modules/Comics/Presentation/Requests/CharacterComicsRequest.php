<?php

namespace App\Modules\Comics\Presentation\Requests;

use App\Modules\Characters\Presentation\Requests\PaginatesCatalog;
use Illuminate\Foundation\Http\FormRequest;

final class CharacterComicsRequest extends FormRequest
{
    use PaginatesCatalog;

    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return array_merge($this->paginationRules(100), [
            'source' => ['sometimes', 'string', 'in:local,live'],
        ]);
    }
}
