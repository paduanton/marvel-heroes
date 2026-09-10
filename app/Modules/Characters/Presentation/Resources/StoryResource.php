<?php

namespace App\Modules\Characters\Presentation\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class StoryResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->resource['id'],
            'title' => $this->resource['title'],
            'type' => $this->resource['type'],
            'modified_at' => $this->resource['modified_at'],
            'counts' => $this->resource['counts'],
        ];
    }
}
