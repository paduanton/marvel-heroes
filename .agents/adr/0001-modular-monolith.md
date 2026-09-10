# ADR 0001: Keep a Modular Monolith

## Status

Accepted

## Context

The catalog is small, read-only, and has one upstream integration. Separate deployments would add operational cost without independent scaling or ownership needs.

## Decision

Keep the Vue SPA and Laravel API in one repository and deployment. Separate product modules and the upstream adapter in code; the frontend consumes only `/api/v1`.

## Consequences

The application is simple to run locally while retaining a stable API seam for a future frontend/backend split.
