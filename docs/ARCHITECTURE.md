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

Numeric ranges and other optional fields (including counts and digital IDs) still need dedicated validation. Required-field failures continue to reject the whole response as described above.

### Optional images

Thumbnail paths must pass PHP's [URL validation filter](https://www.php.net/manual/en/filter.constants.php#constant.filter-validate-url). The adapter then inspects [URL components](https://www.php.net/manual/en/function.parse-url.php), accepting only absolute HTTP/HTTPS bases without user information, a query or a fragment. Queries and fragments would divert the existing `/portrait_uncanny.{extension}` suffix away from the URL path. Backslashes are rejected; extensions must be nonempty ASCII alphanumeric tokens, without a leading dot. Invalid values produce `image_url: null`, preserving the record and allowing the response to be cached.

Valid base paths, schemes, ports and extension casing are preserved. This is syntax validation, not a domain allowlist, DNS check, image download or content-type check. HTTP is not upgraded to HTTPS, and the filter's ASCII limitation remains; Unicode URLs are not converted. The server makes no additional network calls to validate images, and existing cached URLs are not rewritten or purged. Image availability and browser load-error handling remain separate concerns.

### Optional dates

The existing OpenAPI contract declares `modified_at` and `on_sale_at` as nullable `date-time` values. [OpenAPI's format registry](https://spec.openapis.org/registry/format/date-time) refers to [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339.html#section-5.6). The adapter accepts four-digit calendar dates with a complete time (including seconds) and an explicit `Z` or numeric offset. Compact offsets such as `-0400` are converted to `-04:00`; lowercase `t`/`z` become uppercase and surrounding whitespace is trimmed. Fractional seconds are preserved without rounding, as are the local time and offset, including the unknown-offset marker `-00:00`.

Non-string, blank, relative, timezone-less, negative-year and malformed values become `null`. Calendar and clock validation uses PHP's [DateTimeImmutable::createFromFormat](https://www.php.net/manual/en/datetimeimmutable.createfromformat.php); errors and overflow warnings are rejected rather than accepting PHP's automatic rollover. Numeric offset hours/minutes are bounded before parsing. Leap seconds (`:60`) are not supported by this adapter and also become `null`, even though RFC 3339 permits them in specific circumstances.

An invalid optional date does not discard the record, trigger a retry or prevent caching. Newly fetched records follow this policy; existing cache entries are not rewritten or purged. No public schema, endpoint, freshness window or credentials change is involved.

## Future split

The Vue client only calls `/api/v1`. Its current TypeScript types are maintained manually against OpenAPI; automated generation is not yet implemented. It can move to a separate deployment later without exposing Marvel credentials or redesigning the Laravel application layer.

### Frontend request lifecycle

The catalog HTTP services preserve Axios cancellation errors instead of wrapping them in `CatalogApiError`. Actual HTTP problems still retain their status, code and detail; transport failures retain the existing fallback message. Requests use [AbortController cancellation](https://axios-http.com/docs/cancellation), not the deprecated CancelToken API.

The character catalog's `useAsyncCollection` aborts its previous request on every new load. Each invocation checks its own signal before updating items, totals, errors or loading state, so an obsolete loader cannot overwrite a newer result even when it ignores cancellation. [Vue scope disposal](https://vuejs.org/api/reactivity-advanced.html#onscopedispose) aborts the current request, ends loading and prevents new loads through that disposed collection. Active failures remain visible and a later load clears the previous error.

These guarantees cover the collection composable, character catalog, story comics and shared HTTP services. Character detail uses the same collection lifecycle for stories and a separate abortable request for its single character resource, as described below. Tests use controlled promises and an Axios transport adapter without real network calls; they are not browser E2E tests.

### Character search and navigation

`useCharacterCatalog` owns the character page's interaction rules. The URL supplies the applied query and page; the input keeps a separate draft during a 300 ms debounce. The title describes the applied query until navigation completes. A changed search pushes one history entry, resets pagination to page one and lets the route watcher perform the request. This avoids a second request from resetting the page while typing. Unchanged trimmed searches do not reload the catalog.

The feature watches the catalog route name, query and page, following [Vue Router's guidance on watching relevant route properties](https://router.vuejs.org/guide/advanced/composition-api.html). Back/forward navigation restores the input, pagination and results without another debounce. Unrelated query parameters are preserved. Other catalog URL changes and leaving the page cancel pending drafts; scope disposal clears the timer. Pagination actions use the applied filter and respect the loaded total and loading state.

Search text is trimmed. An empty query loads the unfiltered catalog; one Unicode code point or more than 100 produces a local validation message, clears the collection and makes no HTTP call. This mirrors the existing OpenAPI bounds without replacing backend validation. Invalid page values, including non-decimal and unsafe integers, fall back to page one for display and requests; incoming URLs are not rewritten solely to canonicalize those values. The collection's `reset` operation cancels pending work, clears items/total/error/loading, and allows a later load to recover.

Tests cover this feature using the real Vue Router with memory history, fake timers and a simulated HTTP transport. They verify debounce timing, request counts, validation, pagination, back/forward navigation and cleanup. Mounted-page rendering and real browser history remain outside this coverage.

### Story comics navigation

`useStoryComics` watches the story ID supplied by the page. Its immediate load and subsequent ID changes request page one. Changing stories resets the collection, clearing the previous items, total and error while aborting pending work. The shared collection lifecycle prevents obsolete responses from updating the current story and aborts loading when the page's scope is disposed.

Pagination remains local to the page, not in the URL. Previous/next actions respect the loaded total and do nothing during loading. Empty results remain empty, active failures remain visible, and a later story change clears the failure and loads again. Story ID validation remains the backend's responsibility.

After a comic error, a manual retry repeats the current story/page with the same page size. The action ignores calls without an error or during loading. A successful retry clears the error; another failure remains visible for another manual attempt. The page exposes the retry button even when the initial request failed without a loaded total. Pagination sits outside the status panel and remains available after a page error when the loaded total allows it, so the visitor can return to a previous page. Both controls are hidden during loading. Retries use the ordinary catalog endpoint, cache and rate limits; there is no automatic retry or cache-refresh flag.

Tests use a reactive story ID, a Vue effect scope and a simulated Axios transport to verify page resets, cancellation, late responses, pagination bounds, empty results, error recovery and disposal. Recovery cases also cover retries on first/later pages, redundant actions and persistent page failures followed by previous-page navigation. They do not mount the page or verify navigation, button visibility or keyboard focus in a browser.

### Character detail lifecycle

`useCharacterDetail` watches the character ID supplied by the page. Each change clears the previous character, stories and errors and starts independent requests for the character and the first ten stories. The character becomes available as soon as its own request completes. Slow or failed stories affect only the related section's loading/error/empty state; they do not hide a successfully loaded character. A character error remains the page-level error, so related content is shown only after a character is available.

Changing IDs aborts both previous requests. Each character request checks its own abort signal before updating the resource, error or loading state; stories reuse `useAsyncCollection`. Scope disposal cancels pending requests and ends both loading states. A later character change recovers from either failure without preserving the previous character's data. An unchanged ID does not reload.

Stories use local pagination with ten items per page. Previous/next actions respect the loaded total and ignore actions while a story request is pending. Paging fetches only stories, leaving the character visible without another detail request. Changing characters resets the page to one and aborts any pending page of the old character. Pagination is not stored in the URL.

The page reuses the catalog pagination controls below the stories' status panel. Controls are hidden during story loading, but remain available after a page error when the loaded total permits pagination, allowing navigation back to a previous page. ID validation remains on the backend.

The related section exposes a manual retry button after a story error, including first-page failures with no loaded total. `retryStories` repeats only the current character's current story page, preserving page size and avoiding another character request. It does nothing without an error or while stories are loading. Starting a retry clears the story error; another failure exposes it again for another manual attempt. Existing collection cancellation and disposal rules also cover retries. There is no automatic browser retry, cache bypass or server refresh flag; the usual API cache, budget and rate limits still apply.

Tests cover these interactions through a reactive ID and Vue effect scope, using controlled HTTP responses for cancellation, out-of-order completion, independent failures, recovery, pagination bounds, repeated actions while loading and empty stories. They do not mount the page or replace browser verification.

## Authentication boundary

Catalog discovery is public. Sanctum, the `Identity` module and identity persistence are planned, not implemented. The design calls for session authentication followed by resource authorization through policies. Read [AUTHENTICATION.md](AUTHENTICATION.md) before implementing a protected endpoint.

## Implementation limits

- The refresh owner waits synchronously for Marvel; this is not background revalidation. Concurrent callers wait briefly for a lock before using stale data when available.
- The calculated lease assumes bounded HTTP timeouts and bounded Redis/local processing. There is no lease renewal or atomic rejection of writes from an expired owner: long process pauses, slow Redis operations or HTTP redirect chains can still outlive it. Nonpositive HTTP timeouts are rejected before dispatch; broader configuration validation and upper bounds remain unimplemented.
- Search normalization happens in the v1 application action; the legacy path does not share that normalization. Equivalent legacy and v1 queries can use separate keys.
- HTTP caching currently applies to successful API GET responses. Restrict it to catalog routes before adding any authenticated or personalized endpoints.
- Explicit retry controls for the character resource and character catalog remain unimplemented. Story and comic retries are implemented, but the tested interactions still need verification in mounted browser pages, including status rendering, retry/pagination controls, keyboard focus and route-driven prop updates.
- Stale state is not exposed to the UI. Real upstream behavior, refreshes outliving the lock, Redis outages and complete browser flows remain unverified by the current suites.
