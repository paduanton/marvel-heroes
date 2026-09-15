# Architecture

Marvel Heroes is a modular monolith. Laravel owns the versioned catalog API and the Vue SPA is served by the same application origin.

```text
Vue SPA -> /api/v1 -> Application actions -> cached Marvel gateway -> Marvel API
                              |                    |
                              |                    +-> Redis (fresh/stale catalog entries and budget)
                              +-> API Resources
                              +-> Identity/Sanctum (planned; not implemented)
```

`app/Modules` holds product-facing behavior. `Application` coordinates a use case; `Domain` holds catalog vocabulary and durable rules; `Presentation` owns HTTP validation, status codes, and serialization. `app/Shared/Marvel` isolates signed upstream HTTP and payload normalization. The upstream response is never a public contract.

## Cache behavior

Each normalized request produces a stable Redis key. A fresh entry is served immediately. On expiry, one request holds a short cache lock while concurrent callers receive a valid stale entry. Failures and exhausted upstream budget also serve stale data when possible. The configured daily budget is a guardrail, not a claim about the upstream provider's current quota.

`MarvelRequestBudget` reserves one slot immediately before each HTTP attempt, including connection retries. The reservation uses the shared cache lock and timestamp history over the preceding 24 hours; midnight does not reset it. Failed attempts remain counted conservatively because the provider may have received them. Cache hits and missing credentials do not consume a slot. A retry without budget is stopped before dispatch; the cached gateway can still return a valid stale response or propagate the existing budget-exhausted problem response.

The opt-in Redis integration suite verifies contention through catalog HTTP requests in separate PHP processes: cold contenders receive the existing refresh-in-progress response without calling Marvel, stale contenders receive cached data, timed-out contenders cannot release another process's lock, and distinct concurrent queries share one budget. See [DEVELOPMENT.md](DEVELOPMENT.md#redis-concurrency-validation) for the isolated test setup and its limits.

### Refresh lock duration

The refresh lease follows the configured request window instead of always expiring after 15 seconds:

```text
A = max(1, configured total HTTP attempts)
T = configured HTTP timeout in seconds (must be positive)
B = budget lock wait per attempt (currently 2 seconds)
D = delay between attempts (currently 200 milliseconds)
lease = max(15, ceil(A * (T + B) + (A - 1) * D / 1000) + 5) seconds
```

The five-second margin allows for local processing and the cache write; it is not a measured worst-case guarantee. The budget wait and retry delay come from the same constants used by the budget limiter and HTTP client. Defaults (two attempts at five seconds) produce a 20-second lease. A 20-second timeout with one attempt produces 27 seconds; four attempts at five seconds produce 34 seconds. The caller's lock-acquisition wait remains two seconds, and fresh/stale data retention is unchanged. A crashed owner can leave its key locked until this longer lease expires.

Laravel defines the retry count as total attempts, not additional retries, and distinguishes lock lifetime from the wait to acquire it. See [HTTP retries](https://laravel.com/docs/13.x/http-client#retries) and [atomic locks](https://laravel.com/docs/13.x/cache#atomic-locks). This calculation is the application's policy, not a guarantee supplied by Laravel.

## Future split

The Vue client only calls `/api/v1`. Its current TypeScript types are maintained manually against OpenAPI; automated generation is not yet implemented. It can move to a separate deployment later without exposing Marvel credentials or redesigning the Laravel application layer.

## Authentication boundary

Catalog discovery is public. Sanctum, the `Identity` module and identity persistence are planned, not implemented. The design calls for session authentication followed by resource authorization through policies. Read [AUTHENTICATION.md](AUTHENTICATION.md) before implementing a protected endpoint.

## Implementation limits

- The refresh owner waits synchronously for Marvel; this is not background revalidation. Concurrent callers wait briefly for a lock before using stale data when available.
- The calculated lease assumes positive, bounded HTTP timeouts and bounded Redis/local processing. There is no lease renewal or atomic rejection of writes from an expired owner: long process pauses, slow Redis operations or HTTP redirect chains can still outlive it. Configuration validation is not yet enforced; in particular, a zero timeout is unbounded in [Guzzle](https://docs.guzzlephp.org/en/stable/request-options.html#timeout) and must not be used with this policy.
- Search normalization happens in the v1 application action; the legacy path does not share that normalization. Equivalent legacy and v1 queries can use separate keys.
- HTTP caching currently applies to successful API GET responses. Restrict it to catalog routes before adding any authenticated or personalized endpoints.
- Frontend cancellation can be wrapped as a catalog error, and overlapping requests can affect loading state. One-character searches, route parameter changes, story pagination and isolated related-content errors still need refinement and regression tests.
- Stale state is not exposed to the UI. Real upstream behavior, refreshes outliving the lock, Redis outages and complete browser flows remain unverified by the current suites.
