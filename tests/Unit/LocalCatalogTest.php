<?php

namespace Tests\Unit;

use App\Shared\Catalog\LocalCatalog;
use Tests\TestCase;

final class LocalCatalogTest extends TestCase
{
    public function test_it_pages_the_curated_catalog_and_searches_before_slicing(): void
    {
        $catalog = new LocalCatalog;
        $first = $catalog->issues('', 0, 20);
        $second = $catalog->issues('', 20, 20);

        $this->assertSame(40, $first['total']);
        $this->assertSame(40, $second['total']);
        $this->assertCount(40, array_unique(array_column([...$first['items'], ...$second['items']], 'id')));
        $this->assertSame(['items' => [], 'total' => 40], $catalog->issues('', 40, 20));

        $result = $catalog->issues(' SPIDER-MAN ', 1, 1);
        $this->assertSame(10, $result['total']);
        $this->assertSame('The Amazing Spider-Man (1963) #2', $result['items'][0]['title']);
        $this->assertSame($result['items'][0], $catalog->issue($result['items'][0]['id']));
        $this->assertNull($result['items'][0]['image_url']);
        $this->assertNull($catalog->issue(1));
        $this->assertSame(['items' => [], 'total' => 0], $catalog->issues('unlisted series', 0, 20));
    }

    public function test_it_exposes_only_curated_character_and_story_relationships(): void
    {
        $catalog = new LocalCatalog;
        $character = $catalog->characters(' spi ', 0, 1)['items'][0];
        $this->assertSame('Spider-Man', $character['name']);
        $this->assertSame($character, $catalog->character($character['id']));
        $this->assertNull($catalog->character(6122));

        $story = $catalog->stories($character['id'], 0, 10)['items'][0];
        $this->assertSame('Spider-Man vs. The Chameleon!', $story['title']);
        $issues = $catalog->comics($story['id'], 0, 20);
        $this->assertSame(1, $issues['total']);
        $this->assertSame('The Amazing Spider-Man (1963) #1', $issues['items'][0]['title']);
        $this->assertSame($issues, $catalog->characterComics($character['id'], 0, 20));
    }
}
