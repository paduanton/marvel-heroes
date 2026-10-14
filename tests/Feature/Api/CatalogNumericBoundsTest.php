<?php

namespace Tests\Feature\Api;

use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class CatalogNumericBoundsTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Http::preventStrayRequests();
        config(['marvel.public_key' => 'test-public', 'marvel.private_key' => 'test-private']);
        Http::fake(['*' => Http::response(['data' => ['results' => [], 'total' => 0]])]);
    }

    #[DataProvider('paginatedResources')]
    public function test_oversized_pages_are_validation_errors_without_upstream_dispatch(string $path): void
    {
        $this->getJson($path.'?page=9223372036854775807&per_page=100')
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation-failed')
            ->assertJsonValidationErrors('page')
            ->assertHeaderMissing('ETag');

        Http::assertNothingSent();
    }

    public static function paginatedResources(): array
    {
        return [
            'characters' => ['/api/v1/characters'],
            'stories' => ['/api/v1/characters/1/stories'],
            'comics' => ['/api/v1/stories/1/comics'],
        ];
    }

    #[DataProvider('paginatedResources')]
    public function test_the_page_limit_is_accepted_with_an_exact_integer_offset(string $path): void
    {
        $this->getJson($path.'?page=9007199254740991&per_page=100')
            ->assertOk()->assertJsonPath('meta.page', 9007199254740991);

        Http::assertSentCount(1);
        Http::assertSent(fn ($request) => $request['offset'] === 900719925474099000 && $request['limit'] === 100);
    }

    #[DataProvider('paginatedResources')]
    public function test_the_first_page_above_the_limit_is_rejected(string $path): void
    {
        $this->getJson($path.'?page=9007199254740992&per_page=1')
            ->assertUnprocessable()->assertJsonValidationErrors('page');

        Http::assertNothingSent();
    }

    #[DataProvider('identifiedResources')]
    public function test_oversized_identifiers_are_not_found_without_upstream_dispatch(string $path): void
    {
        $this->getJson(sprintf($path, '999999999999999999999999999999'))
            ->assertNotFound()
            ->assertJsonPath('code', 'resource-not-found')
            ->assertHeaderMissing('ETag');

        Http::assertNothingSent();
    }

    public static function identifiedResources(): array
    {
        return [
            'character' => ['/api/v1/characters/%s'],
            'stories' => ['/api/v1/characters/%s/stories'],
            'comics' => ['/api/v1/stories/%s/comics'],
            'legacy character' => ['/api/character/id/%s'],
            'legacy stories' => ['/api/character/stories/%s'],
            'legacy comics' => ['/api/character/comics/%s'],
        ];
    }

    #[DataProvider('identifiedResources')]
    public function test_zero_and_the_first_identifier_above_the_limit_are_rejected(string $path): void
    {
        foreach (['0', '000', '9007199254740992'] as $id) {
            $this->getJson(sprintf($path, $id))
                ->assertNotFound()->assertJsonPath('code', 'resource-not-found');
        }

        Http::assertNothingSent();
    }

    #[DataProvider('identifiedResources')]
    public function test_the_identifier_limit_and_compatible_leading_zeroes_reach_the_source(string $path): void
    {
        foreach (['9007199254740991', '0009007199254740991'] as $id) {
            $response = $this->getJson(sprintf($path, $id));
            $expectedStatus = in_array($path, ['/api/v1/characters/%s', '/api/character/id/%s'], true) ? 404 : 200;
            $response->assertStatus($expectedStatus);
        }

        Http::assertSentCount(1);
        Http::assertSent(fn ($request) => str_contains($request->url(), '/9007199254740991'));
    }
}
