# Marvel Heroes Agent Guide

Read `CONTEXT.md`, relevant ADRs, `docs/openapi.yaml`, and this guide before changing code. For identity, protected endpoints, session cookies, tokens, or secrets, also read `docs/AUTHENTICATION.md`.

## Authority

Work only within the user's explicit request. Ask for explicit approval before actions with meaningful impact: committing, staging, pushing, deleting or moving broad file sets, changing public API contracts, migrations, dependency major upgrades, secrets/configuration changes, Docker/runtime changes, or security policy changes.

Do not commit, stage, push, rewrite history, or create pull requests without explicit user approval. A request to implement does not authorize a Git commit.

## Increment Protocol

Complete one small, verifiable slice at a time. After every completed incremental slice, report this exact handoff before starting the next unrelated slice:

```text
Suggested commit: type(scope): concise imperative summary

Summary:
- What changed and why.

Files changed:
- path/to/file
```

The suggestion is informational. Wait for explicit approval before staging or committing. Keep messages precise, evidence-based, and short. Prefer the narrowest scope that identifies the product area.

When a decision is needed, ask one explicit question naming the action and scope, and state what answer authorizes it. A summary alone is not an approval request. Honor approval already given for a specific commit or an explicitly approved sequence; continue within that scope without asking again. Report the commit hash and checks after execution. When no decision is pending, state the next action clearly.

## Conventional Commits

Format: `type(scope): concise imperative summary`

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `build`, `chore`, `perf`, `ci`, `revert`.

Scopes: `characters`, `stories`, `comics`, `marvel-client`, `cache`, `api`, `frontend`, `docker`, `docs`, `agents`, `dependencies`.

One commit represents one verified intention. Separate behavior, refactoring, tooling, and documentation when they can be independently reviewed. Use `!` and a `BREAKING CHANGE:` footer only for intentional public breaks.

## Design and Tests

- Backend domain rules belong in `app/Modules/*/Domain`; use cases belong in `Application`; HTTP belongs in `Presentation`; external HTTP and Redis belong in `Shared` or module `Infrastructure`.
- Frontend features own interaction rules; services call only `/api/v1`; utilities format or transform local UI data only.
- Preserve a small interface around the Marvel integration. Controllers and Vue components never consume raw upstream payloads.
- Test public seams: API contract, cache behavior, normalizers, and visible UI behavior. Add a regression test with every bug fix.
- Update `docs/openapi.yaml` before changing an API response or endpoint. Record hard-to-reverse decisions in an ADR.

## Security

- Keep secrets in environment variables only. Never print, document, commit, or expose them to the frontend.
- Treat authentication as a boundary: catalog reads remain public unless the product scope changes; private routes use `auth:sanctum` and policies, not frontend-only checks or browser-stored tokens.
- Inject production secrets at runtime and read them through configuration. Any change to credentials, session security, secret injection, or protected-route policy requires explicit user approval.
- Validate all public input, cap pagination, and preserve rate limits and safe error responses.
- Treat the Marvel API as unavailable by default: use timeouts, bounded retry, cache, and stale fallback.
