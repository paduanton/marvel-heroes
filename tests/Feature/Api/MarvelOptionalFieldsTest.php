<?php

namespace Tests\Feature\Api;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class MarvelOptionalFieldsTest extends TestCase
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

    public function test_it_caches_a_valid_character_without_a_malformed_optional_image(): void
    {
        $this->fakeRecord(['thumbnail' => 'not an image object']);

        for ($request = 0; $request < 2; $request++) {
            $this->getJson('/api/v1/characters')
                ->assertOk()
                ->assertJsonPath('data.0.id', 1)
                ->assertJsonPath('data.0.name', 'Example Hero')
                ->assertJsonPath('data.0.image_url', null);
        }
        Http::assertSentCount(1);
    }

    #[DataProvider('invalidOptionalLists')]
    public function test_it_uses_null_for_malformed_optional_lists(string $field, string $output, mixed $value): void
    {
        $this->fakeRecord([$field => $value]);

        $this->getJson('/api/v1/stories/1/comics')
            ->assertOk()
            ->assertJsonPath('data.0.id', 1)
            ->assertJsonPath('data.0.title', 'Example Comic')
            ->assertJsonPath('data.0.'.$output, null);
        Http::assertSentCount(1);
    }

    public static function invalidOptionalLists(): iterable
    {
        foreach (['dates' => 'on_sale_at', 'prices' => 'digital_price'] as $field => $output) {
            foreach (['string' => 'not a list', 'number' => 42, 'boolean' => true, 'null' => null, 'empty' => []] as $case => $value) {
                yield $field.'/'.$case => [$field, $output, $value];
            }
        }
    }

    #[DataProvider('invalidThumbnails')]
    public function test_it_uses_null_for_incomplete_or_malformed_comic_images(mixed $thumbnail): void
    {
        $this->fakeRecord(['thumbnail' => $thumbnail]);

        $this->getJson('/api/v1/stories/1/comics')->assertOk()->assertJsonPath('data.0.image_url', null);
    }

    public static function invalidThumbnails(): array
    {
        return [
            'number' => [42],
            'boolean' => [true],
            'missing extension' => [['path' => 'https://images.example.test/hero']],
            'invalid path type' => [['path' => [], 'extension' => 'jpg']],
            'invalid extension type' => [['path' => 'https://images.example.test/hero', 'extension' => []]],
            'blank path' => [['path' => ' ', 'extension' => 'jpg']],
            'blank extension' => [['path' => 'https://images.example.test/hero', 'extension' => '']],
        ];
    }

    public function test_it_preserves_valid_optional_values_among_malformed_entries(): void
    {
        $this->fakeRecord([
            'thumbnail' => ['path' => 'https://images.example.test/comic', 'extension' => 'jpg'],
            'dates' => [null, 42, 'invalid', [], ['type' => 'onsaleDate', 'date' => '2026-01-02T00:00:00Z']],
            'prices' => [null, false, 'invalid', [], ['type' => 'digitalPurchasePrice', 'price' => '3.99']],
        ]);

        $this->getJson('/api/v1/stories/1/comics')
            ->assertOk()
            ->assertJsonPath('data.0.image_url', 'https://images.example.test/comic/portrait_uncanny.jpg')
            ->assertJsonPath('data.0.on_sale_at', '2026-01-02T00:00:00Z')
            ->assertJsonPath('data.0.digital_price', 3.99);
    }

    public function test_it_ignores_malformed_optional_entry_values(): void
    {
        $this->fakeRecord([
            'dates' => [['type' => 'onsaleDate', 'date' => ['invalid']]],
            'prices' => [['type' => 'digitalPurchasePrice', 'price' => ['invalid']]],
        ]);

        $this->getJson('/api/v1/stories/1/comics')
            ->assertOk()
            ->assertJsonPath('data.0.on_sale_at', null)
            ->assertJsonPath('data.0.digital_price', null);
    }

    public function test_it_does_not_emit_a_nonfinite_optional_price(): void
    {
        $this->fakeRecord(['prices' => [['type' => 'digitalPurchasePrice', 'price' => '1e999']]]);

        $this->getJson('/api/v1/stories/1/comics')->assertOk()->assertJsonPath('data.0.digital_price', null);
    }

    private function fakeRecord(array $fields): void
    {
        $record = array_replace(['id' => 1, 'name' => 'Example Hero', 'title' => 'Example Comic'], $fields);
        Http::fake(['marvel.test/*' => Http::response(['data' => ['results' => [$record], 'total' => 1]])]);
    }
}
