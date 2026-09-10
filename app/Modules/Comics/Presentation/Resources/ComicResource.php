<?php

namespace App\Modules\Comics\Presentation\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class ComicResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->resource['id'],
            'digital_id' => $this->resource['digital_id'],
            'title' => $this->resource['title'],
            'description' => $this->resource['description'],
            'format' => $this->resource['format'],
            'modified_at' => $this->resource['modified_at'],
            'on_sale_at' => $this->resource['on_sale_at'],
            'digital_price' => $this->resource['digital_price'],
            'image_url' => $this->resource['image_url'],
        ];
    }
}
