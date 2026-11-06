<?php

namespace App\Shared\Catalog\Presentation;

use App\Modules\Characters\Presentation\Requests\PaginatesCatalog;
use Illuminate\Foundation\Http\FormRequest;

final class SearchCatalogRequest extends FormRequest
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
            'source' => ['sometimes', 'string', 'in:local,live'],
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
