# ADR 0003: Use Sanctum Sessions and Runtime Secrets

## Status

Accepted for the authentication implementation slice; no runtime implementation has started.

## Context

Marvel Heroes is a same-origin Vue SPA and Laravel API. Its catalog is public, but future identity-owned behavior needs authentication. The upstream Marvel Comics credentials must remain server-only.

## Decision

Use Laravel Sanctum session authentication for the first-party SPA. Keep catalog reads public and rate-limited. Add Sanctum personal access tokens only when an external client has a demonstrated need. Persist identity and token records in PostgreSQL; catalog data remains non-persistent outside Redis.

Inject secrets at runtime from an ignored local `.env` in development and a platform secret manager in production. Do not use Docker build arguments, browser environment variables, or committed unencrypted environment files for secrets.

## Consequences

- The authentication slice adds a database and migrations for identity, not for catalog content.
- State-changing SPA requests require CSRF bootstrap and cookie configuration.
- Passport, JWT stored in browser storage, and OAuth2 are intentionally absent until their specific product cases exist.
- `docs/AUTHENTICATION.md` is the implementation reference.
