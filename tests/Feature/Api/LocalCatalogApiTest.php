<?php

namespace Tests\Feature\Api;

use Illuminate\Support\Facades\Http;
use Tests\TestCase;

final class LocalCatalogApiTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['catalog.provider' => 'local', 'marvel.public_key' => '', 'marvel.private_key' => '']);
        Http::fake();
    }

    protected function tearDown(): void
    {
        Http::assertNothingSent();
        parent::tearDown();
    }

    public function test_it_serves_an_anonymous_comic_search_and_conditional_detail(): void
    {
        $list = $this->getJson('/api/v1/comics?query=spider-man&source=local&page=2&per_page=2')
            ->assertOk()->assertJsonCount(2, 'data')
            ->assertJsonPath('meta.page', 2)->assertJsonPath('meta.total', 10)
            ->assertJsonPath('meta.source', 'local')->assertJsonPath('meta.cache.state', 'fresh')
            ->assertHeaderMissing('Set-Cookie');

        $id = $list->json('data.0.id');
        $detail = $this->getJson("/api/v1/comics/{$id}")
            ->assertOk()->assertJsonPath('data.title', 'The Amazing Spider-Man (1963) #3')
            ->assertJsonPath('meta.source', 'local')->assertHeader('Vary', 'Accept-Encoding');
        $this->getJson("/api/v1/comics/{$id}", ['If-None-Match' => $detail->headers->get('ETag')])->assertStatus(304);
    }

    public function test_it_retains_legacy_character_and_story_navigation_with_the_local_source(): void
    {
        $id = $this->getJson('/api/v1/characters?query=spi')->assertOk()
            ->assertJsonPath('meta.source', 'local')->json('data.0.id');

        $this->getJson('/api/character/spi')->assertOk()->assertHeader('Deprecation', 'true')->assertJsonPath('id', $id);
        $this->getJson("/api/v1/characters/{$id}")->assertOk()->assertJsonPath('data.name', 'Spider-Man');
        $this->getJson("/api/v1/characters/{$id}/comics")->assertOk()
            ->assertJsonPath('data.0.title', 'The Amazing Spider-Man (1963) #1');
        $storyId = $this->getJson("/api/v1/characters/{$id}/stories")->assertOk()->json('data.0.id');
        $this->getJson("/api/v1/stories/{$storyId}/comics")->assertOk()
            ->assertJsonPath('data.0.title', 'The Amazing Spider-Man (1963) #1');
        $this->getJson('/ready')->assertOk()->assertExactJson(['status' => 'ready']);
    }

    public function test_it_distinguishes_an_empty_search_from_invalid_and_unavailable_requests(): void
    {
        $this->getJson('/api/v1/comics?query=nonexistent')->assertOk()->assertJsonPath('data', []);
        $this->getJson('/api/v1/comics?source=invalid')->assertUnprocessable()->assertJsonValidationErrors('source');
        $this->getJson('/api/v1/comics?source=live')->assertServiceUnavailable()->assertJsonPath('code', 'catalog-source-unavailable');
        $this->getJson('/api/v1/characters?source=live')->assertServiceUnavailable()->assertJsonPath('code', 'catalog-source-unavailable');
        $this->getJson('/api/v1/comics/9007199254740992')->assertNotFound();
        $this->getJson('/api/v1/characters/1011334')->assertNotFound();
    }
}
