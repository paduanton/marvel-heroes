<?php

namespace Tests\Feature\Api;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class MarvelDateTest extends TestCase
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

    public function test_it_caches_a_character_with_a_null_date_when_upstream_sends_invalid_text(): void
    {
        $this->fakeDate('not a date');

        for ($request = 0; $request < 2; $request++) {
            $this->getJson('/api/v1/characters')
                ->assertOk()
                ->assertJsonPath('data.0.id', 1)
                ->assertJsonPath('data.0.modified_at', null);
        }
        Http::assertSentCount(1);
    }

    #[DataProvider('resourceDates')]
    public function test_it_normalizes_compact_offsets_in_every_resource(string $url, string $field): void
    {
        $this->fakeDate('2024-02-29T13:45:10-0400');

        $this->getJson($url)->assertOk()->assertJsonPath($field, '2024-02-29T13:45:10-04:00');
    }

    public static function resourceDates(): array
    {
        return [
            'catalog' => ['/api/v1/characters', 'data.0.modified_at'],
            'character' => ['/api/v1/characters/1', 'data.modified_at'],
            'story' => ['/api/v1/characters/1/stories', 'data.0.modified_at'],
            'comic modified' => ['/api/v1/stories/1/comics', 'data.0.modified_at'],
            'comic on sale' => ['/api/v1/stories/1/comics', 'data.0.on_sale_at'],
        ];
    }

    #[DataProvider('invalidDates')]
    public function test_it_uses_null_for_invalid_optional_dates(mixed $date): void
    {
        $this->fakeDate($date);

        $this->getJson('/api/v1/stories/1/comics')
            ->assertOk()
            ->assertJsonPath('data.0.id', 1)
            ->assertJsonPath('data.0.modified_at', null)
            ->assertJsonPath('data.0.on_sale_at', null);
        Http::assertSentCount(1);
    }

    public static function invalidDates(): array
    {
        return [
            'missing' => [null],
            'blank' => ['  '],
            'number' => [42],
            'boolean' => [true],
            'array' => [['date' => '2024-01-02T03:04:05Z']],
            'relative expression' => ['tomorrow'],
            'date only' => ['2024-01-02'],
            'missing offset' => ['2024-01-02T03:04:05'],
            'named timezone' => ['2024-01-02T03:04:05Europe/London'],
            'negative year placeholder' => ['-0001-11-30T00:00:00-0500'],
            'zero month and day' => ['0000-00-00T00:00:00Z'],
            'nonleap day' => ['2026-02-29T00:00:00Z'],
            'nonleap century' => ['1900-02-29T00:00:00Z'],
            'month overflow' => ['2024-13-01T00:00:00Z'],
            'day overflow' => ['2024-04-31T00:00:00Z'],
            'hour overflow' => ['2024-01-02T24:00:00Z'],
            'minute overflow' => ['2024-01-02T03:60:00Z'],
            'second overflow' => ['2024-01-02T03:04:61Z'],
            'unsupported leap second' => ['2016-12-31T23:59:60Z'],
            'offset hour overflow' => ['2024-01-02T03:04:05+24:00'],
            'offset minute overflow' => ['2024-01-02T03:04:05-0460'],
            'trailing data' => ['2024-01-02T03:04:05Z extra'],
            'embedded null byte' => ["2024-01-02T03:04:05\0Z"],
        ];
    }

    #[DataProvider('validDates')]
    public function test_it_preserves_valid_dates_and_caches_the_normalized_result(string $date, string $expected): void
    {
        $this->fakeDate($date);

        for ($request = 0; $request < 2; $request++) {
            $this->getJson('/api/v1/stories/1/comics')
                ->assertOk()
                ->assertJsonPath('data.0.modified_at', $expected)
                ->assertJsonPath('data.0.on_sale_at', $expected);
        }
        Http::assertSentCount(1);
    }

    public static function validDates(): array
    {
        return [
            'UTC' => ['2024-01-02T03:04:05Z', '2024-01-02T03:04:05Z'],
            'positive offset' => ['2024-01-02T03:04:05+05:30', '2024-01-02T03:04:05+05:30'],
            'negative offset' => ['2024-01-02T03:04:05-04:00', '2024-01-02T03:04:05-04:00'],
            'compact positive offset' => ['2024-01-02T03:04:05+0530', '2024-01-02T03:04:05+05:30'],
            'unknown local offset' => ['2024-01-02T03:04:05-0000', '2024-01-02T03:04:05-00:00'],
            'fractional seconds' => ['2024-01-02T03:04:05.120Z', '2024-01-02T03:04:05.120Z'],
            'nanoseconds' => ['2024-01-02T03:04:05.123456789-0400', '2024-01-02T03:04:05.123456789-04:00'],
            'leap century' => ['2000-02-29T00:00:00Z', '2000-02-29T00:00:00Z'],
            'lowercase designators' => ['2024-01-02t03:04:05z', '2024-01-02T03:04:05Z'],
            'surrounding whitespace' => [' 2024-01-02T03:04:05Z ', '2024-01-02T03:04:05Z'],
        ];
    }

    private function fakeDate(mixed $date): void
    {
        $record = [
            'id' => 1,
            'name' => 'Example Hero',
            'title' => 'Example Title',
            'modified' => $date,
            'dates' => [['type' => 'onsaleDate', 'date' => $date]],
        ];
        Http::fake(['marvel.test/*' => Http::response(['data' => ['results' => [$record], 'total' => 1]])]);
    }
}
