<?php

namespace Tests\Feature\Api;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class CatalogConditionalRequestTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        config([
            'marvel.base_url' => 'https://marvel.test/v1/public',
            'marvel.public_key' => 'test-public',
            'marvel.private_key' => 'test-private',
        ]);
        Http::preventStrayRequests();
        Http::fake(['marvel.test/*' => Http::response([
            'data' => ['results' => [['id' => 1, 'name' => 'Example Hero', 'title' => 'Example Story']], 'total' => 1],
        ])]);
    }

    #[DataProvider('matchingValidators')]
    public function test_matching_validators_reuse_the_catalog_without_a_response_body(string $format): void
    {
        $path = '/api/v1/characters';
        $initial = $this->getJson($path)->assertOk();
        $etag = $initial->headers->get('ETag');

        $response = $this->getJson($path, ['If-None-Match' => sprintf($format, $etag)])
            ->assertStatus(304)
            ->assertHeader('ETag', $etag)
            ->assertHeader('Cache-Control', $initial->headers->get('Cache-Control'))
            ->assertHeader('X-Request-ID');

        self::assertSame('', $response->getContent());
        Http::assertSentCount(1);
    }

    public static function matchingValidators(): array
    {
        return [
            'exact tag' => ['%s'],
            'weak tag' => ['W/%s'],
            'tag list' => ['"unrelated", %s, "another"'],
            'weak tag list' => ['"unrelated", W/%s'],
            'wildcard' => ['*'],
        ];
    }

    public function test_nonmatching_validators_return_the_current_representation(): void
    {
        $path = '/api/v1/characters';
        $initial = $this->getJson($path)->assertOk();

        $this->getJson($path, ['If-None-Match' => 'W/"unrelated", "another"'])
            ->assertOk()
            ->assertHeader('ETag', $initial->headers->get('ETag'))
            ->assertExactJson($initial->json());

        Http::assertSentCount(1);
    }

    public function test_wildcard_does_not_turn_validation_errors_into_not_modified(): void
    {
        $this->getJson('/api/v1/characters?query=x', ['If-None-Match' => '*'])
            ->assertUnprocessable()
            ->assertJsonPath('code', 'validation-failed')
            ->assertHeaderMissing('ETag');

        Http::assertNothingSent();
    }

    public function test_legacy_catalog_revalidation_preserves_deprecation_headers(): void
    {
        $path = '/api/character/example';
        $initial = $this->getJson($path)->assertOk();

        $this->getJson($path, ['If-None-Match' => 'W/'.$initial->headers->get('ETag')])
            ->assertStatus(304)
            ->assertHeader('Deprecation', 'true')
            ->assertHeader('ETag', $initial->headers->get('ETag'));

        Http::assertSentCount(1);
    }
}
