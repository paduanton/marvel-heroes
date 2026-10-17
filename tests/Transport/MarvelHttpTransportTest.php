<?php

namespace Tests\Transport;

use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\MarvelTransportTestCase;

class MarvelHttpTransportTest extends MarvelTransportTestCase
{
    #[DataProvider('redirects')]
    public function test_it_does_not_follow_redirects_or_cache_the_redirect_target(int $status): void
    {
        $this->source('redirect', ['status' => $status]);
        $this->getJson('/api/v1/characters')->assertStatus(502)
            ->assertJsonPath('code', 'upstream-unavailable')->assertHeaderMissing('ETag');
        self::assertSame([[
            'path' => '/v1/public/characters', 'method' => 'GET',
            'signature_valid' => true, 'private_key_absent' => true,
        ]], $this->calls());
        $this->source('healthy');
        $this->getJson('/api/v1/characters')->assertOk()->assertJsonPath('data.0.name', 'Transport Hero');
        $this->getJson('/api/v1/characters')->assertOk();
        self::assertCount(2, $this->calls());
    }

    #[DataProvider('catalogResources')]
    public function test_redirects_preserve_stale_resources_until_the_source_recovers(string $path, string $labelPath, string $label): void
    {
        $fresh = $this->getJson($path)->assertOk()->assertJsonPath($labelPath, $label)
            ->assertJsonPath('meta.cache.state', 'fresh');
        $this->travel(31)->days();
        $this->source('redirect');
        $stale = $this->withHeader('If-None-Match', $fresh->headers->get('ETag'))->getJson($path)
            ->assertOk()->assertJsonPath('meta.cache.state', 'stale');
        self::assertSame($fresh->json('data'), $stale->json('data'));
        self::assertCount(2, $this->calls());
        self::assertNotSame($fresh->headers->get('ETag'), $stale->headers->get('ETag'));
        $this->withHeader('If-None-Match', $stale->headers->get('ETag'))->getJson($path)->assertStatus(304);
        self::assertCount(3, $this->calls());
        $this->source('healthy');
        $this->getJson($path)->assertOk()->assertJsonPath('meta.cache.state', 'fresh');
        $this->getJson($path)->assertOk();
        self::assertCount(4, $this->calls());
        self::assertNotContains('/followed', array_column($this->calls(), 'path'));
    }

    public function test_a_redirect_consumes_one_budget_slot_without_following_or_retrying(): void
    {
        config(['marvel.daily_budget' => 1]);
        $this->source('redirect');
        $this->getJson('/api/v1/characters')->assertStatus(502);
        $this->source('healthy');
        $this->getJson('/api/v1/characters')->assertStatus(503)->assertJsonPath('code', 'upstream-budget-exhausted');
        self::assertCount(1, $this->calls());
    }

    public static function redirects(): array
    {
        return ['moved' => [301], 'found' => [302], 'see other' => [303], 'temporary' => [307], 'permanent' => [308]];
    }
}
