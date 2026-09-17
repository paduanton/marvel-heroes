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

`MarvelHttpClient` rejects an effective timeout below one second before dispatch or budget reservation. Fresh cache remains available, and refresh failures can use valid stale entries. Without either, the API returns the existing safe `502 / upstream-unavailable` problem. This is a dispatch-time check, not startup validation; it does not change `/ready`. A zero timeout would otherwise allow an indefinite wait in [Guzzle](https://docs.guzzlephp.org/en/stable/request-options.html#timeout).

## Upstream collection validation

Before normalizing a successful upstream response, the client requires a JSON object containing a `data` object, a `results` JSON array of objects, and a nonnegative integer `total`. It preserves JSON object/array distinctions during validation: `{}` is not accepted as an empty results array. Unknown properties are ignored. This is the adapter's minimum structural contract, not the application's public response format.

Malformed JSON, missing collection fields, incorrectly typed result items and invalid totals raise the existing upstream-unavailable exception. The HTTP attempt remains charged to the budget, and a malformed payload does not trigger an automatic retry. The cache wrapper can serve a valid stale entry without replacing it or renewing its freshness. Without usable cache, the API returns the existing safe `502 / upstream-unavailable` response; payload contents are not included in the error. A later valid response can populate or refresh the cache normally.

Valid empty collections still return `200` with `data: []`; an empty character-detail result still produces `404`. Existing handling of upstream HTTP `404` is unchanged.

The external normalizers require every character, story and comic to have a positive integer `id`. Characters require a string `name`, and stories/comics require a string `title`; labels must be nonempty after PHP `trim`. Numeric strings are not coerced into IDs, and valid labels are preserved verbatim. Missing or malformed required fields reject the entire response through the existing upstream-unavailable exception, not a partially filtered collection. Valid stale data remains usable until a successful refresh replaces it; otherwise the API returns the same safe `502` response without record contents.

These checks validate records received from the integration, not visitor input. Missing optional fields retain the normalizers' existing null/default behavior. Previously cached entries are not purged or repaired by these checks; remediation requires a separate operator-approved action.

Optional thumbnails with the wrong container type, missing/non-string/blank path or extension, or the upstream unavailable-image marker produce `image_url: null`. Malformed date and price list containers produce null optional values; non-record entries are ignored. Existing valid image paths and finite numeric prices are preserved; date values follow the normalization below. Prices that overflow to infinity are skipped so they cannot break JSON serialization. A valid record with these nullable fallbacks remains cacheable instead of failing the whole collection.

URL schemes, numeric ranges and other optional fields (including counts and digital IDs) still need dedicated validation. Required-field failures continue to reject the whole response as described above.

### Optional dates

The existing OpenAPI contract declares `modified_at` and `on_sale_at` as nullable `date-time` values. [OpenAPI's format registry](https://spec.openapis.org/registry/format/date-time) refers to [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339.html#section-5.6). The adapter accepts four-digit calendar dates with a complete time (including seconds) and an explicit `Z` or numeric offset. Compact offsets such as `-0400` are converted to `-04:00`; lowercase `t`/`z` become uppercase and surrounding whitespace is trimmed. Fractional seconds are preserved without rounding, as are the local time and offset, including the unknown-offset marker `-00:00`.

Non-string, blank, relative, timezone-less, negative-year and malformed values become `null`. Calendar and clock validation uses PHP's [DateTimeImmutable::createFromFormat](https://www.php.net/manual/en/datetimeimmutable.createfromformat.php); errors and overflow warnings are rejected rather than accepting PHP's automatic rollover. Numeric offset hours/minutes are bounded before parsing. Leap seconds (`:60`) are not supported by this adapter and also become `null`, even though RFC 3339 permits them in specific circumstances.

An invalid optional date does not discard the record, trigger a retry or prevent caching. Newly fetched records follow this policy; existing cache entries are not rewritten or purged. No public schema, endpoint, freshness window or credentials change is involved.

## Future split

The Vue client only calls `/api/v1`. Its current TypeScript types are maintained manually against OpenAPI; automated generation is not yet implemented. It can move to a separate deployment later without exposing Marvel credentials or redesigning the Laravel application layer.

## Authentication boundary

Catalog discovery is public. Sanctum, the `Identity` module and identity persistence are planned, not implemented. The design calls for session authentication followed by resource authorization through policies. Read [AUTHENTICATION.md](AUTHENTICATION.md) before implementing a protected endpoint.

## Implementation limits

- The refresh owner waits synchronously for Marvel; this is not background revalidation. Concurrent callers wait briefly for a lock before using stale data when available.
- The calculated lease assumes bounded HTTP timeouts and bounded Redis/local processing. There is no lease renewal or atomic rejection of writes from an expired owner: long process pauses, slow Redis operations or HTTP redirect chains can still outlive it. Nonpositive HTTP timeouts are rejected before dispatch; broader configuration validation and upper bounds remain unimplemented.
- Search normalization happens in the v1 application action; the legacy path does not share that normalization. Equivalent legacy and v1 queries can use separate keys.
- HTTP caching currently applies to successful API GET responses. Restrict it to catalog routes before adding any authenticated or personalized endpoints.
- Frontend cancellation can be wrapped as a catalog error, and overlapping requests can affect loading state. One-character searches, route parameter changes, story pagination and isolated related-content errors still need refinement and regression tests.
- Stale state is not exposed to the UI. Real upstream behavior, refreshes outliving the lock, Redis outages and complete browser flows remain unverified by the current suites.
