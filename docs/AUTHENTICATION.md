# Authentication

## Decision

The catalog remains anonymously readable. Authentication protects identity and future private capabilities; it is not a gate placed in front of character discovery.

Laravel Sanctum authenticates the first-party Vue SPA using Laravel session cookies, not browser-held Bearer tokens. Both are served from the same origin. The default cookie is derived from `APP_NAME` (`marvel_heroes_session` with the example configuration), is `HttpOnly`, `Secure` in production, and `SameSite=Lax`. Axios initializes `/sanctum/csrf-cookie` and sends `X-XSRF-TOKEN` for session mutations. Laravel 13 can also trust secure same-origin Fetch Metadata; local HTTP falls back to CSRF token validation.

Sanctum personal access tokens are reserved for a future external client or CLI. They are never issued to the first-party SPA and are stored and compared by Sanctum as hashes. OAuth2/Passport is deferred until third-party applications need delegated access to user-owned data.

## Endpoint policy

| Surface | Access | Reason |
| --- | --- | --- |
| `GET /api/v1/characters`, character detail, stories, comics | Anonymous, rate-limited | Discovery is the product's primary public workflow. |
| `POST /api/v1/auth/register`, `POST /api/v1/auth/login` | Anonymous, aggressively rate-limited, CSRF-protected | Establish a first-party session without exposing a token. |
| `POST /api/v1/auth/logout`, `GET /api/v1/me` | `auth:sanctum` | Session lifecycle and current identity. |
| Future preferences, favorites, moderation, or operational actions | `auth:sanctum` plus policy/ability | Private behavior must authorize the resource, not merely authenticate the caller. |

Protected endpoints return `401` for an unauthenticated request and `403` for an authenticated caller without the required policy or token ability. Public catalog endpoints never accept a Marvel credential from the browser.

## Implemented boundary

PostgreSQL stores identities; catalog content and request budgets remain in Redis. The `Identity` module provides registration and credential-checking actions, request validation, safe resources and a current-identity policy. Session operations remain at the HTTP boundary. Login and registration regenerate the session; logout invalidates it and regenerates CSRF. Identity and CSRF responses use `private, no-store`, without ETags; only catalog routes receive public HTTP caching.

Public catalog GETs, including legacy reads, exclude the SPA's stateful middleware: they neither initialize nor inspect sessions or issue session cookies. Their non-personalized responses are identical regardless of the caller's identity, so a PostgreSQL outage cannot block cached discovery for an authenticated visitor. Redis, budget and rate limits still apply. Never add private or user-specific fields to these publicly cached resources; use a separate protected endpoint. Identity routes retain their web session/CSRF middleware; private routes keep `auth:sanctum` and policies.

Emails are trimmed and lowercased before validation, lookup and persistence, with a database unique constraint. Registration requires matching passwords of at least 12 characters and at most 72 UTF-8 bytes, without null characters, matching the existing bcrypt hasher's limits. Login uses the same generic credential failure for unknown email and incorrect password. Registration is limited to five attempts per minute/IP; login to ten per minute/IP and five per normalized email/IP; private reads/mutations to sixty per minute/identity.

The SPA exposes `/register`, `/login` and `/account`. It does not store credentials or tokens in browser storage and does not automatically replay failed mutations. A failed session check is not treated as anonymous unless the response is `401`.

The Sanctum token table is provisioned, but there is no token issuance endpoint or token-enabled user trait. Email verification and password reset remain deferred until a mail provider is selected. External-client tokens require a separate approved capability with abilities, expiration and revocation. Registration currently proves possession of a password, not ownership of the supplied email address.

Further credential, migration, Docker, session-security or protected-route changes require explicit approval. Existing databases must not be migrated automatically by agents or container startup. See [DEVELOPMENT.md](DEVELOPMENT.md) for setup and isolated HTTP validation.

## Secret handling

`MARVEL_PRIVATE_KEY`, `APP_KEY`, database passwords, Redis passwords, mail credentials, and any environment-encryption key are secrets. `MARVEL_PUBLIC_KEY`, base URL, timeout, TTL, and request budget are server configuration; they still stay out of browser bundles.

- Local development uses an ignored `.env` created from `.env.example`. The example contains names and safe defaults only.
- Docker receives local values through the ignored `.env`; secrets are neither copied into the image nor supplied through Docker build arguments.
- Production injects each secret from the deployment platform's secret manager at runtime into the PHP service only. Nginx and the built Vue assets receive none.
- `config/marvel.php` is the only configuration boundary for Marvel values. Application code reads `config()`, never `env()` directly. Cache configuration only after runtime secrets are present.
- A committed `.env.encrypted` is permitted only when its `LARAVEL_ENV_ENCRYPTION_KEY` is held separately in a password manager or deployment secret manager. Platform-managed secrets remain the preferred production path.
- Rotate a Marvel credential pair by updating the secret manager, deploying new PHP workers, confirming upstream calls, then revoking the old key at the provider. Rotate `APP_KEY` through an approved maintenance procedure because it invalidates encrypted cookies and sessions.
- Logs, exception payloads, screenshots, OpenAPI examples, commits, and agent handoffs contain secret names but never secret values.
