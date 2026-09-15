<?php

namespace Tests\Feature\Api;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class MarvelRecordTest extends TestCase
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
            'marvel.cache.fresh_days' => 30,
            'marvel.cache.stale_days' => 180,
        ]);
        Http::preventStrayRequests();
    }

    #[DataProvider('resources')]
    public function test_it_rejects_a_missing_record_id_without_caching_it(string $path, string $label, string $recordPath): void
    {
        Http::fake(['marvel.test/*' => Http::sequence()
            ->push(['data' => ['results' => [[$label => 'Example']], 'total' => 1]])
            ->push(['data' => ['results' => [['id' => 1, $label => 'Example']], 'total' => 1]])]);

        $this->getJson($path)
            ->assertStatus(502)
            ->assertHeader('Content-Type', 'application/problem+json')
            ->assertJsonPath('code', 'upstream-unavailable');
        Http::assertSentCount(1);

        $this->getJson($path)->assertOk()->assertJsonPath($recordPath.'.id', 1);
        $this->getJson($path)->assertOk()->assertJsonPath($recordPath.'.id', 1);
        Http::assertSentCount(2);
    }

    public static function resources(): array
    {
        return [
            'characters' => ['/api/v1/characters', 'name', 'data.0'],
            'character detail' => ['/api/v1/characters/1', 'name', 'data'],
            'stories' => ['/api/v1/characters/1/stories', 'title', 'data.0'],
            'comics' => ['/api/v1/stories/1/comics', 'title', 'data.0'],
        ];
    }

    #[DataProvider('invalidRecords')]
    public function test_it_rejects_invalid_required_fields(string $path, array $record): void
    {
        Http::fake(['marvel.test/*' => Http::response(['data' => ['results' => [$record], 'total' => 1]])]);

        $this->getJson($path)
            ->assertStatus(502)
            ->assertJsonPath('code', 'upstream-unavailable')
            ->assertJsonPath('detail', 'The catalog source is temporarily unavailable.');
        Http::assertSentCount(1);
    }

    public static function invalidRecords(): iterable
    {
        foreach (self::resources() as $resource => [$path, $label]) {
            $records = [
                'zero ID' => ['id' => 0, $label => 'Example'],
                'negative ID' => ['id' => -1, $label => 'Example'],
                'string ID' => ['id' => '1', $label => 'Example'],
                'fractional ID' => ['id' => 1.5, $label => 'Example'],
                'missing label' => ['id' => 1],
                'null label' => ['id' => 1, $label => null],
                'blank label' => ['id' => 1, $label => " \t\n "],
                'numeric label' => ['id' => 1, $label => 12],
                'array label' => ['id' => 1, $label => ['message' => 'Upstream diagnostic']],
            ];
            foreach ($records as $case => $record) {
                yield $resource.'/'.$case => [$path, $record];
            }
        }
    }

    #[DataProvider('resources')]
    public function test_it_keeps_stale_data_when_a_refresh_has_an_invalid_record(string $path, string $label, string $recordPath): void
    {
        Http::fake(['marvel.test/*' => Http::sequence()
            ->push(['data' => ['results' => [['id' => 1, $label => 'Original']], 'total' => 1]])
            ->push(['data' => ['results' => [['id' => 1, $label => '']], 'total' => 1]])
            ->push(['data' => ['results' => [['id' => 1, $label => 'Updated']], 'total' => 1]])]);

        $this->getJson($path)->assertOk()->assertJsonPath($recordPath.'.'.$label, 'Original');
        $this->travel(31)->days();
        $this->getJson($path)->assertOk()->assertJsonPath($recordPath.'.'.$label, 'Original');
        Http::assertSentCount(2);

        $this->getJson($path)->assertOk()->assertJsonPath($recordPath.'.'.$label, 'Updated');
        $this->getJson($path)->assertOk()->assertJsonPath($recordPath.'.'.$label, 'Updated');
        Http::assertSentCount(3);
    }

    public function test_it_rejects_the_whole_collection_instead_of_caching_partial_records(): void
    {
        Http::fake(['marvel.test/*' => Http::sequence()
            ->push(['data' => ['results' => [
                ['id' => 1, 'name' => 'Valid Hero'],
                ['id' => 0, 'name' => 'Invalid Hero'],
            ], 'total' => 2]])
            ->push(['data' => ['results' => [['id' => 2, 'name' => 'Recovered Hero']], 'total' => 1]])]);

        $this->getJson('/api/v1/characters')->assertStatus(502)->assertJsonPath('code', 'upstream-unavailable');
        $this->getJson('/api/v1/characters')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', 2);
        Http::assertSentCount(2);
    }
}
