<?php

namespace App\Modules\Identity\Presentation\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class LoginIdentityRequest extends FormRequest
{
    use NormalizesIdentityEmail;

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email:rfc', 'max:254'],
            'password' => ['bail', 'required', 'string', 'max:72', new BcryptPassword],
        ];
    }
}
