<?php

namespace Tests\Unit;

use App\Shared\Cache\CachedMarvelCatalogGateway;
use App\Shared\Marvel\Contracts\MarvelCatalogGateway;
use App\Shared\Marvel\Exceptions\MarvelBudgetExhaustedException;
use App\Shared\Marvel\Exceptions\MarvelUnavailableException;
use Illuminate\Support\Facades\Cache;
use Mockery;
use Tests\TestCase;

class CachedMarvelCatalogGatewayTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        config(['marvel.daily_budget' => 2400, 'marvel.cache.fresh_days' => 30, 'marvel.cache.stale_days' => 180]);
    }

    public function test_it_reuses_a_fresh_catalog_response(): void
    {
        $result = ['items' => [['id' => 1, 'name' => 'Example Hero']], 'total' => 1];
        $upstream = Mockery::mock(MarvelCatalogGateway::class);
        $upstream->shouldReceive('characters')->once()->with('example', 0, 20)->andReturn($result);
        $gateway = new CachedMarvelCatalogGateway($upstream);

        self::assertSame($result, $gateway->characters('example', 0, 20));
        self::assertSame($result, $gateway->characters('example', 0, 20));
    }

    public function test_it_serves_stale_data_when_the_upstream_fails(): void
    {
        $character = ['id' => 1, 'name' => 'Example Hero'];
        $upstream = Mockery::mock(MarvelCatalogGateway::class);
        $upstream->shouldReceive('character')->once()->with(1)->andReturn($character);
        $upstream->shouldReceive('character')->once()->with(1)->andThrow(new MarvelUnavailableException);
        $gateway = new CachedMarvelCatalogGateway($upstream);

        self::assertSame($character, $gateway->character(1));
        $this->travel(31)->days();
        self::assertSame($character, $gateway->character(1));
    }

    public function test_it_blocks_a_cache_miss_when_the_budget_is_exhausted(): void
    {
        config(['marvel.daily_budget' => 0]);
        $upstream = Mockery::mock(MarvelCatalogGateway::class);
        $upstream->shouldNotReceive('character');
        $gateway = new CachedMarvelCatalogGateway($upstream);

        $this->expectException(MarvelBudgetExhaustedException::class);
        $gateway->character(1);
    }

    public function test_it_serves_stale_data_when_the_budget_is_exhausted(): void
    {
        $character = ['id' => 1, 'name' => 'Example Hero'];
        $upstream = Mockery::mock(MarvelCatalogGateway::class);
        $upstream->shouldReceive('character')->once()->with(1)->andReturn($character);
        $gateway = new CachedMarvelCatalogGateway($upstream);

        self::assertSame($character, $gateway->character(1));
        $this->travel(31)->days();
        config(['marvel.daily_budget' => 0]);
        self::assertSame($character, $gateway->character(1));
    }

    public function test_it_caches_a_missing_character_response(): void
    {
        Cache::flush();
        $upstream = new class implements MarvelCatalogGateway
        {
            public int $characterCalls = 0;

            public function characters(string $query, int $offset, int $limit): array
            {
                return ['items' => [], 'total' => 0];
            }

            public function character(int $characterId): ?array
            {
                $this->characterCalls++;

                return null;
            }

            public function stories(int $characterId, int $offset, int $limit): array
            {
                return ['items' => [], 'total' => 0];
            }

            public function comics(int $storyId, int $offset, int $limit): array
            {
                return ['items' => [], 'total' => 0];
            }
        };
        $gateway = new CachedMarvelCatalogGateway($upstream);

        self::assertNull($gateway->character(404));
        self::assertNull($gateway->character(404));
        self::assertSame(1, $upstream->characterCalls);
    }
}
