<?php

namespace Tests\Feature\Api;

use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class CharacterSearchValidationTest extends TestCase
{
    #[DataProvider('invalidSearches')]
    public function test_invalid_searches_are_rejected_before_upstream_dispatch(string $query): void
    {
        Http::preventStrayRequests();
        Http::fake();

        $this->getJson('/api/v1/characters?'.$query)->assertUnprocessable()
            ->assertJsonPath('code', 'validation-failed')->assertJsonValidationErrors('query')
            ->assertHeader('Content-Type', 'application/problem+json')->assertHeaderMissing('ETag');

        Http::assertNothingSent();
    }

    public static function invalidSearches(): array
    {
        return [
            'array' => ['query[]=spider'],
            'nested array' => ['query[name]=spider'],
            'repeated array' => ['query[]=spider&query[]=iron'],
            'single code point' => ['query='.rawurlencode("\u{00e9}")],
            'too long' => ['query='.str_repeat('a', 101)],
        ];
    }
}
