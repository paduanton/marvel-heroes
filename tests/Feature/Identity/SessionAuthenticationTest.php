<?php

namespace Tests\Feature\Identity;

use App\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class SessionAuthenticationTest extends TestCase
{
    use RefreshDatabase;

    protected function beforeRefreshingDatabase(): void
    {
        config(['database.default' => 'sqlite', 'database.connections.sqlite.database' => ':memory:']);
    }

    public function test_registration_creates_a_hashed_identity_and_a_private_session_response(): void
    {
        $this->postJson('/api/v1/auth/register', [
            'name' => 'Example Visitor', 'email' => '  VISITOR@example.test ',
            'password' => 'valid-test-passphrase', 'password_confirmation' => 'valid-test-passphrase',
        ])->assertCreated()->assertJsonPath('data.email', 'visitor@example.test')
            ->assertJsonMissingPath('data.password')->assertJsonMissingPath('token')
            ->assertHeader('Cache-Control', 'no-store, private')->assertHeaderMissing('ETag');
        $user = User::query()->sole();
        self::assertTrue(Hash::check('valid-test-passphrase', $user->password));
        $this->assertAuthenticatedAs($user, 'web');
    }

    public function test_malformed_email_and_unsafe_bcrypt_inputs_are_validation_errors(): void
    {
        $this->postJson('/api/v1/auth/login', ['email' => ['invalid'], 'password' => 'test-passphrase'])
            ->assertUnprocessable()->assertJsonPath('code', 'validation-failed');

        foreach ([str_repeat('a', 73), str_repeat("\u{00e9}", 40), "valid-test\0passphrase"] as $password) {
            $this->postJson('/api/v1/auth/register', [
                'name' => 'Visitor', 'email' => 'visitor@example.test',
                'password' => $password, 'password_confirmation' => $password,
            ])->assertUnprocessable()->assertJsonPath('code', 'validation-failed');
        }
        $this->assertGuest('web');
    }

    public function test_login_rotates_the_session_and_authorizes_only_the_current_identity(): void
    {
        $user = User::query()->create(['name' => 'Visitor', 'email' => 'visitor@example.test', 'password' => Hash::make('valid-test-passphrase')]);
        $this->withSession(['marker' => 'kept']);
        $previous = session()->getId();
        $this->postJson('/api/v1/auth/login', ['email' => ' VISITOR@example.test ', 'password' => 'valid-test-passphrase'])
            ->assertOk()->assertJsonPath('data.id', $user->id)->assertJsonMissingPath('data.password');
        self::assertNotSame($previous, session()->getId());
        $this->getJson('/api/v1/me', ['If-None-Match' => '*'])->assertOk()
            ->assertJsonPath('data.email', $user->email)->assertHeader('Cache-Control', 'no-store, private')->assertHeaderMissing('ETag');
        $other = new User;
        $other->id = $user->id + 1;
        self::assertFalse(Gate::forUser($user)->allows('view', $other));
    }

    public function test_invalid_credentials_are_indistinguishable_and_leave_the_caller_anonymous(): void
    {
        User::query()->create(['name' => 'Visitor', 'email' => 'visitor@example.test', 'password' => Hash::make('valid-test-passphrase')]);
        $known = $this->postJson('/api/v1/auth/login', ['email' => 'visitor@example.test', 'password' => 'incorrect-passphrase'])
            ->assertUnprocessable()->json('errors');
        $unknown = $this->postJson('/api/v1/auth/login', ['email' => 'missing@example.test', 'password' => 'incorrect-passphrase'])
            ->assertUnprocessable()->json('errors');
        self::assertSame($known, $unknown);
        $this->assertGuest('web');
    }

    public function test_duplicate_normalized_email_and_confirmation_mismatch_are_rejected(): void
    {
        User::query()->create(['name' => 'Visitor', 'email' => 'visitor@example.test', 'password' => Hash::make('valid-test-passphrase')]);
        $this->postJson('/api/v1/auth/register', [
            'name' => 'Another visitor', 'email' => ' VISITOR@example.test ',
            'password' => 'valid-test-passphrase', 'password_confirmation' => 'different-passphrase',
        ])->assertUnprocessable()->assertJsonValidationErrors(['email', 'password']);
        $this->assertGuest('web');
    }

    public function test_anonymous_identity_requests_are_private_problem_responses(): void
    {
        $this->getJson('/api/v1/me')->assertUnauthorized()->assertJsonPath('code', 'unauthenticated')
            ->assertHeader('Content-Type', 'application/problem+json')->assertHeader('Cache-Control', 'no-store, private')
            ->assertHeaderMissing('ETag')->assertJsonStructure(['request_id']);
        $this->postJson('/api/v1/auth/logout')->assertUnauthorized();
        $this->get('/api/v1/me')->assertUnauthorized()->assertJsonPath('code', 'unauthenticated');
    }

    public function test_logout_invalidates_the_session_and_rotates_csrf(): void
    {
        $user = User::query()->create(['name' => 'Visitor', 'email' => 'visitor@example.test', 'password' => Hash::make('valid-test-passphrase')]);
        $this->actingAs($user, 'web')->withSession(['marker' => 'discard']);
        $previous = session()->getId();
        $token = session()->token();
        $this->postJson('/api/v1/auth/logout')->assertNoContent()->assertHeader('Cache-Control', 'no-store, private');
        self::assertNotSame($previous, session()->getId());
        self::assertNotSame($token, session()->token());
        self::assertNull(session('marker'));
        Auth::forgetGuards();
        $this->getJson('/api/v1/me')->assertUnauthorized();
    }

    public function test_a_policy_denial_is_a_private_forbidden_problem(): void
    {
        $user = User::query()->create(['name' => 'Visitor', 'email' => 'visitor@example.test', 'password' => Hash::make('valid-test-passphrase')]);
        $this->actingAs($user, 'web');
        Gate::before(fn () => false);
        $this->getJson('/api/v1/me')->assertForbidden()->assertJsonPath('code', 'forbidden')
            ->assertHeader('Cache-Control', 'no-store, private')->assertHeaderMissing('ETag')->assertJsonMissingPath('data');
    }

    public function test_login_throttles_repeated_attempts_and_preserves_retry_headers(): void
    {
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $this->postJson('/api/v1/auth/login', ['email' => 'visitor@example.test', 'password' => 'incorrect-passphrase'])->assertUnprocessable();
        }
        $this->postJson('/api/v1/auth/login', ['email' => ' VISITOR@example.test ', 'password' => 'incorrect-passphrase'])
            ->assertTooManyRequests()->assertJsonPath('code', 'rate-limit-exceeded')->assertHeader('Retry-After');
    }

    public function test_identity_storage_failure_returns_a_safe_private_problem(): void
    {
        Schema::drop('users');
        $this->postJson('/api/v1/auth/login', ['email' => 'visitor@example.test', 'password' => 'valid-test-passphrase'])
            ->assertServiceUnavailable()->assertJsonPath('code', 'identity-unavailable')
            ->assertHeader('Cache-Control', 'no-store, private')->assertJsonMissingPath('exception');
    }
}
