<?php

namespace App\Modules\Characters\Presentation\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class ListRelatedCatalogRequest extends FormRequest
{
    use PaginatesCatalog;

    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return $this->paginationRules(100);
    }
}
