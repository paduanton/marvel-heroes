# ADR 0002: Cache the Upstream Catalog in Redis

## Status

Accepted

## Context

Marvel data changes slowly and the upstream free tier has a limited request budget. Direct browser calls would expose credentials and multiply upstream traffic.

## Decision

Use server-side Redis cache with fresh and stale windows, locking, and a configurable daily budget. Browser HTTP caching is complementary only.

## Consequences

Visitors receive stable responses during upstream failures. Redis becomes a required local service, but no database is introduced for catalog data.
