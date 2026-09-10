<?php

namespace Tests\Feature\Api;

use App\Shared\Marvel\Contracts\MarvelCatalogGateway;
use App\Shared\Marvel\Exceptions\MarvelBudgetExhaustedException;
use App\Shared\Marvel\Exceptions\MarvelUnavailableException;
use Mockery;
use Tests\TestCase;

class CharacterCatalogTest extends TestCase
{
    public function test_it_returns_not_found_for_a_missing_character(): void
    {
        $this->app->bind(MarvelCatalogGateway::class, fn () => new FakeMarvelCatalogGateway);

        $this->getJson('/api/v1/characters/999')
            ->assertNotFound()
            ->assertJsonPath('code', 'resource-not-found');
    }

    public function test_it_returns_empty_related_collections_with_pagination(): void
    {
        $this->app->bind(MarvelCatalogGateway::class, fn () => new FakeMarvelCatalogGateway);

        foreach (['/api/v1/characters/1/stories', '/api/v1/stories/1/comics'] as $path) {
            $this->getJson($path.'?page=2&per_page=10')
                ->assertOk()
                ->assertJsonPath('data', [])
                ->assertJsonPath('meta', ['page' => 2, 'per_page' => 10, 'total' => 0]);
        }
    }

    public function test_it_returns_service_unavailable_when_the_budget_is_exhausted(): void
    {
        $gateway = Mockery::mock(MarvelCatalogGateway::class);
        $gateway->shouldReceive('characters')->once()->andThrow(new MarvelBudgetExhaustedException);
        $this->app->instance(MarvelCatalogGateway::class, $gateway);

        $this->getJson('/api/v1/characters')
            ->assertStatus(503)
            ->assertHeader('Content-Type', 'application/problem+json')
            ->assertJsonPath('code', 'upstream-budget-exhausted');
    }

    public function test_it_returns_a_safe_problem_when_the_upstream_fails(): void
    {
        $gateway = Mockery::mock(MarvelCatalogGateway::class);
        $gateway->shouldReceive('characters')->once()->andThrow(new MarvelUnavailableException('Internal failure detail'));
        $this->app->instance(MarvelCatalogGateway::class, $gateway);

        $this->getJson('/api/v1/characters')
            ->assertStatus(502)
            ->assertHeader('Content-Type', 'application/problem+json')
            ->assertJsonPath('code', 'upstream-unavailable')
            ->assertDontSee('Internal failure detail');
    }

    public function test_it_returns_the_documented_character_collection_contract(): void
    {
        $this->app->bind(MarvelCatalogGateway::class, fn () => new FakeMarvelCatalogGateway);

        $response = $this->getJson('/api/v1/characters?query=spider&page=2&per_page=10');

        $response->assertOk()
            ->assertJsonPath('data.0.id', 1009610)
            ->assertJsonPath('data.0.name', 'Spider-Man')
            ->assertJsonPath('meta', ['page' => 2, 'per_page' => 10, 'total' => 1])
            ->assertHeader('ETag')
            ->assertHeader('X-Request-ID');
    }

    public function test_it_rejects_a_single_character_search_term(): void
    {
        $this->getJson('/api/v1/characters?query=x')
            ->assertUnprocessable()
            ->assertHeader('Content-Type', 'application/problem+json')
            ->assertJsonPath('code', 'validation-failed');
    }

    public function test_it_returns_a_problem_document_for_an_unknown_v1_route(): void
    {
        $this->getJson('/api/v1/not-a-resource')
            ->assertNotFound()
            ->assertHeader('Content-Type', 'application/problem+json')
            ->assertJsonPath('code', 'resource-not-found');
    }

    public function test_legacy_routes_are_explicitly_deprecated_and_use_the_cached_gateway(): void
    {
        $this->app->bind(MarvelCatalogGateway::class, fn () => new FakeMarvelCatalogGateway);

        $this->getJson('/api/character/spider-man')
            ->assertOk()
            ->assertHeader('Deprecation', 'true')
            ->assertJsonPath('id', 1009610);
    }

    public function test_it_replaces_an_invalid_client_request_id(): void
    {
        $response = $this->withHeader('X-Request-ID', 'not-a-uuid')->getJson('/api/v1/not-a-resource');

        $response->assertNotFound();
        self::assertNotSame('not-a-uuid', $response->headers->get('X-Request-ID'));
    }
}

class FakeMarvelCatalogGateway implements MarvelCatalogGateway
{
    public function characters(string $query, int $offset, int $limit): array
    {
        return ['items' => [[
            'id' => 1009610,
            'name' => 'Spider-Man',
            'description' => 'Friendly neighborhood hero.',
            'modified_at' => '2024-01-01T00:00:00Z',
            'image_url' => 'https://example.test/spider-man.jpg',
        ]], 'total' => 1];
    }

    public function character(int $characterId): ?array
    {
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
}
