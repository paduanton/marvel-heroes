<?php

namespace Tests\Feature\Api;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class MarvelImageTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        config([
            'marvel.base_url' => 'https://marvel.test/v1/public',
            'marvel.public_key' => 'test-public',
            'marvel.private_key' => 'test-private',
            'marvel.timeout_seconds' => 5,
            'marvel.retry_times' => 2,
            'marvel.daily_budget' => 10,
        ]);
        Http::preventStrayRequests();
    }

    public function test_it_caches_a_character_without_an_invalid_image_url(): void
    {
        $this->fakeImage('not a URL', 'jpg');

        for ($request = 0; $request < 2; $request++) {
            $this->getJson('/api/v1/characters')
                ->assertOk()
                ->assertJsonPath('data.0.id', 1)
                ->assertJsonPath('data.0.image_url', null);
        }
        Http::assertSentCount(1);
    }

    #[DataProvider('invalidPaths')]
    public function test_it_uses_null_for_unusable_thumbnail_paths(string $path): void
    {
        $this->fakeImage($path, 'jpg');

        $this->getJson('/api/v1/stories/1/comics')
            ->assertOk()
            ->assertJsonPath('data.0.id', 1)
            ->assertJsonPath('data.0.image_url', null);
        Http::assertSentCount(1);
    }

    public static function invalidPaths(): array
    {
        return [
            'relative' => ['/images/hero'],
            'protocol relative' => ['//images.example.test/hero'],
            'missing host' => ['https:///hero'],
            'invalid port' => ['https://images.example.test:99999/hero'],
            'FTP' => ['ftp://images.example.test/hero'],
            'file' => ['file:///images/hero'],
            'data' => ['data:image/png;base64,AAAA'],
            'script' => ['javascript:alert(1)'],
            'userinfo' => ['https://example-user:example-password@images.example.test/hero'],
            'username only' => ['https://example-user@images.example.test/hero'],
            'query' => ['https://images.example.test/hero?size=small'],
            'empty query' => ['https://images.example.test/hero?'],
            'fragment' => ['https://images.example.test/hero#preview'],
            'empty fragment' => ['https://images.example.test/hero#'],
            'space' => ['https://images.example.test/hero image'],
            'newline' => ["https://images.example.test/hero\nimage"],
            'null byte' => ["https://images.example.test/hero\0image"],
            'backslash' => ['https://images.example.test/hero\\image'],
            'unavailable image' => ['https://images.example.test/image_not_available'],
        ];
    }

    #[DataProvider('invalidExtensions')]
    public function test_it_uses_null_when_an_extension_changes_the_url_structure(string $extension): void
    {
        $this->fakeImage('https://images.example.test/hero', $extension);

        $this->getJson('/api/v1/characters/1')->assertOk()->assertJsonPath('data.image_url', null);
    }

    public static function invalidExtensions(): array
    {
        return [
            'slash' => ['jpg/other'],
            'backslash' => ['jpg\\other'],
            'query' => ['jpg?size=small'],
            'fragment' => ['jpg#preview'],
            'space' => ['jp g'],
            'newline' => ["jpg\n"],
            'leading dot' => ['.jpg'],
            'encoded separator' => ['jpg%2Fother'],
        ];
    }

    #[DataProvider('validImages')]
    public function test_it_preserves_valid_image_urls(string $url, string $field, string $path, string $extension, string $expected): void
    {
        $this->fakeImage($path, $extension);

        $this->getJson($url)->assertOk()->assertJsonPath($field, $expected);
        Http::assertSentCount(1);
    }

    public static function validImages(): array
    {
        return [
            'catalog HTTPS' => [
                '/api/v1/characters', 'data.0.image_url',
                'https://images.example.test/hero', 'jpg',
                'https://images.example.test/hero/portrait_uncanny.jpg',
            ],
            'character HTTP' => [
                '/api/v1/characters/1', 'data.image_url',
                'http://images.example.test/hero', 'png',
                'http://images.example.test/hero/portrait_uncanny.png',
            ],
            'comic HTTPS' => [
                '/api/v1/stories/1/comics', 'data.0.image_url',
                'https://images.example.test/comic', 'webp',
                'https://images.example.test/comic/portrait_uncanny.webp',
            ],
            'case preserved' => [
                '/api/v1/stories/1/comics', 'data.0.image_url',
                'HTTPS://images.example.test/Comic', 'JPG',
                'HTTPS://images.example.test/Comic/portrait_uncanny.JPG',
            ],
            'encoded path and port' => [
                '/api/v1/stories/1/comics', 'data.0.image_url',
                'https://images.example.test:8443/comic%20cover', 'jpg',
                'https://images.example.test:8443/comic%20cover/portrait_uncanny.jpg',
            ],
        ];
    }

    private function fakeImage(string $path, string $extension): void
    {
        $record = [
            'id' => 1,
            'name' => 'Example Hero',
            'title' => 'Example Comic',
            'thumbnail' => ['path' => $path, 'extension' => $extension],
        ];
        Http::fake(['marvel.test/*' => Http::response(['data' => ['results' => [$record], 'total' => 1]])]);
    }
}
