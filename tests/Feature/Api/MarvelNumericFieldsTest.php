<?php

namespace Tests\Feature\Api;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class MarvelNumericFieldsTest extends TestCase
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

    #[DataProvider('invalidIntegers')]
    public function test_malformed_counts_fall_back_without_discarding_or_refetching_a_story(mixed $value): void
    {
        $counts = array_fill_keys(['creators', 'series', 'characters', 'comics', 'events'], ['available' => $value]);
        $this->fakeRecord($counts);

        for ($request = 0; $request < 2; $request++) {
            $this->getJson('/api/v1/characters/1/stories')
                ->assertOk()->assertJsonPath('data.0.title', 'Example Story')
                ->assertJsonPath('data.0.counts', array_fill_keys(array_keys($counts), 0));
        }
        Http::assertSentCount(1);
    }

    #[DataProvider('invalidIntegers')]
    public function test_malformed_digital_ids_are_nullable_and_cacheable(mixed $value): void
    {
        $this->fakeRecord(['digitalId' => $value]);

        for ($request = 0; $request < 2; $request++) {
            $this->getJson('/api/v1/stories/1/comics')
                ->assertOk()->assertJsonPath('data.0.id', 1)->assertJsonPath('data.0.digital_id', null);
        }
        Http::assertSentCount(1);
    }

    public static function invalidIntegers(): array
    {
        return [
            'negative' => [-1], 'float' => [1.5], 'integer-like float' => [2.0],
            'numeric string' => ['2'], 'text' => ['unknown'], 'boolean' => [true],
            'array' => [[2]], 'null' => [null], 'oversized float' => [1e30],
        ];
    }

    public function test_valid_integer_counts_and_digital_ids_are_preserved(): void
    {
        $counts = ['creators' => 0, 'series' => 5, 'characters' => 10, 'comics' => 2, 'events' => 100];
        $this->fakeRecord(array_merge(
            array_map(fn (int $count) => ['available' => $count], $counts),
            ['digitalId' => 42],
        ));
        $this->getJson('/api/v1/characters/1/stories')->assertOk()->assertJsonPath('data.0.counts', $counts);
        $this->getJson('/api/v1/stories/1/comics')->assertOk()->assertJsonPath('data.0.digital_id', 42);
        Http::assertSentCount(2);
    }

    public function test_zero_is_not_a_digital_edition_id(): void
    {
        $this->fakeRecord(['digitalId' => 0]);
        $this->getJson('/api/v1/stories/1/comics')->assertOk()->assertJsonPath('data.0.digital_id', null);
    }

    #[DataProvider('negativePrices')]
    public function test_a_negative_price_is_skipped_in_favor_of_a_valid_later_entry(mixed $price): void
    {
        $this->fakeRecord(['prices' => [
            ['type' => 'digitalPurchasePrice', 'price' => $price],
            ['type' => 'digitalPurchasePrice', 'price' => '3.99'],
        ]]);
        $this->getJson('/api/v1/stories/1/comics')->assertOk()->assertJsonPath('data.0.digital_price', 3.99);
    }

    public static function negativePrices(): array
    {
        return ['integer' => [-1], 'decimal' => [-3.99], 'string' => ['-3.99']];
    }

    public function test_an_invalid_only_price_becomes_null_and_zero_remains_valid(): void
    {
        Http::fake(['marvel.test/*' => Http::sequence()
            ->push(['data' => ['results' => [
                ['id' => 1, 'title' => 'Invalid price', 'prices' => [['type' => 'digitalPurchasePrice', 'price' => -1]]],
                ['id' => 2, 'title' => 'Zero price', 'prices' => [['type' => 'digitalPurchasePrice', 'price' => 0]]],
            ], 'total' => 2]])]);
        $this->getJson('/api/v1/stories/1/comics')->assertOk()
            ->assertJsonPath('data.0.digital_price', null)->assertJsonPath('data.1.digital_price', 0);
    }

    private function fakeRecord(array $fields): void
    {
        $record = array_replace(['id' => 1, 'title' => 'Example Story'], $fields);
        $body = json_encode(['data' => ['results' => [$record], 'total' => 1]], JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION);
        Http::fake(['marvel.test/*' => Http::response($body, 200, ['Content-Type' => 'application/json'])]);
    }
}
