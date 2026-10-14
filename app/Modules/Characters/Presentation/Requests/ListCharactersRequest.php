<?php

namespace App\Modules\Characters\Presentation\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class ListCharactersRequest extends FormRequest
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
            'query' => ['nullable', 'string', 'min:2', 'max:100'],
        ]);
    }

    protected function prepareForValidation(): void
    {
        $query = $this->query('query', '');
        if (is_string($query)) {
            $this->merge(['query' => trim($query)]);
        }
    }
}
