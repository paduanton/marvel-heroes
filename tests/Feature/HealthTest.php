<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class HealthTest extends TestCase
{
    public function test_health_endpoint_is_available(): void
    {
        $this->getJson('/health')
            ->assertOk()
            ->assertJsonPath('status', 'ok');
    }

    public function test_readiness_requires_configured_credentials(): void
    {
        config(['marvel.public_key' => '', 'marvel.private_key' => '']);

        $this->getJson('/ready')->assertStatus(503)->assertExactJson(['status' => 'not_ready']);
    }

    public function test_readiness_accepts_accessible_cache_and_configured_credentials(): void
    {
        config(['marvel.public_key' => 'test-public', 'marvel.private_key' => 'test-private']);

        $this->getJson('/ready')->assertOk()->assertExactJson(['status' => 'ready']);
    }

    public function test_readiness_returns_a_safe_response_when_cache_is_unavailable(): void
    {
        Cache::shouldReceive('store')->once()->andThrow(new \RuntimeException('Internal cache failure'));

        $this->getJson('/ready')->assertStatus(503)->assertExactJson(['status' => 'not_ready']);
    }
}
