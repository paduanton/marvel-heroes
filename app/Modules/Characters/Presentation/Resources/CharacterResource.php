<?php

namespace App\Modules\Characters\Presentation\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class CharacterResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->resource['id'],
            'name' => $this->resource['name'],
            'description' => $this->resource['description'],
            'modified_at' => $this->resource['modified_at'],
            'image_url' => $this->resource['image_url'],
        ];
    }
}
