<?php

namespace Tests\Unit;

use App\Shared\Marvel\MarvelPayloadNormalizer;
use Tests\TestCase;

class MarvelPayloadNormalizerTest extends TestCase
{
    /**
     * A basic test example.
     */
    public function test_it_hides_an_unavailable_marvel_image(): void
    {
        $character = (new MarvelPayloadNormalizer)->character([
            'id' => 1,
            'name' => 'Example Hero',
            'thumbnail' => [
                'path' => 'http://i.annihil.us/u/prod/marvel/i/mg/1/00/image_not_available',
                'extension' => 'jpg',
            ],
        ]);

        $this->assertNull($character['image_url']);
    }
}
