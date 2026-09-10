# Authentication Plan

## Decision

The catalog remains anonymously readable. Authentication protects identity and future private capabilities; it is not a gate placed in front of character discovery.

Laravel Sanctum is the selected mechanism. The first-party Vue SPA and Laravel are served from the same origin, so it will use Laravel session cookies, not browser-held Bearer tokens. `laravel_session` is `HttpOnly`, `Secure` in production, and `SameSite=Lax`; the separate `XSRF-TOKEN` cookie is sent as the CSRF header by Axios for state-changing requests.

Sanctum personal access tokens are reserved for a future external client or CLI. They are never issued to the first-party SPA and are stored and compared by Sanctum as hashes. OAuth2/Passport is deferred until third-party applications need delegated access to user-owned data.

## Endpoint policy

| Surface | Access | Reason |
| --- | --- | --- |
| `GET /api/v1/characters`, character detail, stories, comics | Anonymous, rate-limited | Discovery is the product's primary public workflow. |
| `POST /api/v1/auth/register`, `POST /api/v1/auth/login` | Anonymous, aggressively rate-limited, CSRF-protected | Establish a first-party session without exposing a token. |
| `POST /api/v1/auth/logout`, `GET /api/v1/me` | `auth:sanctum` | Session lifecycle and current identity. |
| Future preferences, favorites, moderation, or operational actions | `auth:sanctum` plus policy/ability | Private behavior must authorize the resource, not merely authenticate the caller. |

Protected endpoints return `401` for an unauthenticated request and `403` for an authenticated caller without the required policy or token ability. Public catalog endpoints never accept a Marvel credential from the browser.

## Implementation order

1. Add PostgreSQL only for identity records and Sanctum token records; catalog data continues to live in Redis and the upstream API.
2. Install Sanctum, add stateful API middleware, configure the first-party domain, session cookie attributes, and CSRF flow.
3. Create an `Identity` module with application actions for registration, login, logout, and current-user lookup. Controllers validate and serialize; policies own authorization.
4. Add the users and Sanctum migrations, unique normalized email, password hashing through Laravel's configured hasher, session regeneration on login, and session invalidation on logout.
5. Publish OpenAPI security schemes and contract tests for anonymous, `401`, `403`, CSRF, throttling, and logout behavior. The SPA adds only the CSRF bootstrap and session-aware Axios configuration.
6. Add email verification and password reset when an email provider is selected. Add personal access tokens with narrow abilities and expiration only when an external consumer is a real product requirement.

This is a security and runtime change. It requires explicit approval before dependency, migration, Docker, or public-contract edits are made.

## Secret handling

`MARVEL_PRIVATE_KEY`, `APP_KEY`, database passwords, Redis passwords, mail credentials, and any environment-encryption key are secrets. `MARVEL_PUBLIC_KEY`, base URL, timeout, TTL, and request budget are server configuration; they still stay out of browser bundles.

- Local development uses an ignored `.env` created from `.env.example`. The example contains names and safe defaults only.
- Docker receives local values through the ignored `.env`; secrets are neither copied into the image nor supplied through Docker build arguments.
- Production injects each secret from the deployment platform's secret manager at runtime into the PHP service only. Nginx and the built Vue assets receive none.
- `config/marvel.php` is the only configuration boundary for Marvel values. Application code reads `config()`, never `env()` directly. Cache configuration only after runtime secrets are present.
- A committed `.env.encrypted` is permitted only when its `LARAVEL_ENV_ENCRYPTION_KEY` is held separately in a password manager or deployment secret manager. Platform-managed secrets remain the preferred production path.
- Rotate a Marvel credential pair by updating the secret manager, deploying new PHP workers, confirming upstream calls, then revoking the old key at the provider. Rotate `APP_KEY` through an approved maintenance procedure because it invalidates encrypted cookies and sessions.
- Logs, exception payloads, screenshots, OpenAPI examples, commits, and agent handoffs contain secret names but never secret values.
