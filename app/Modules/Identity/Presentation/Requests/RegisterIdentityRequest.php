<?php

namespace App\Modules\Identity\Presentation\Requests;

use Illuminate\Foundation\Http\FormRequest;

final class RegisterIdentityRequest extends FormRequest
{
    use NormalizesIdentityEmail;

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name' => ['required', 'string', 'max:255'],
            'email' => ['required', 'string', 'email:rfc', 'max:254', 'unique:users,email'],
            'password' => ['bail', 'required', 'string', 'min:12', 'max:72', new BcryptPassword, 'confirmed'],
            'password_confirmation' => ['required', 'string', 'min:12', 'max:72'],
        ];
    }
}
