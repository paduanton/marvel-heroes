# Development

## Requirements

- Docker Desktop with the Linux container engine running.
- Marvel public and private credentials for real catalog requests.
- Node 22.12+ and the pnpm version pinned in `package.json` for host-side frontend and commit checks.

Local secrets belong in the ignored `.env`. The example contains names and defaults only. Application code reads configuration; production secrets must be injected at runtime into PHP. No Marvel credentials are required for the isolated tests below.

## First local setup (PowerShell)

Run from the repository root. Create `.env` only if it does not already exist:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

Set a local `DB_PASSWORD` in the ignored `.env` before building; Compose requires it for PostgreSQL. Then:

```powershell
docker compose build
docker compose run --rm --no-deps --user root --volume "${PWD}/.env:/var/www/html/.env" app php artisan key:generate --force
docker compose up -d
docker compose exec app php artisan migrate
```

Set `MARVEL_PUBLIC_KEY` and `MARVEL_PRIVATE_KEY` in the local `.env` before starting real catalog requests. For installations using the old names, replace `MARVEL_PUBLICKEY`, `MARVEL_PRIVATEKEY`, and `MARVEL_URL` with `MARVEL_PUBLIC_KEY`, `MARVEL_PRIVATE_KEY`, and `MARVEL_BASE_URL`.

The one-off key-generation and migration commands above are for a new installation only. Key generation mounts the host `.env` explicitly so the key survives container removal. An existing installation keeps its current `APP_KEY` and requires review and explicit authorization before migrations. Container startup never runs migrations automatically. Subsequent starts use `docker compose up -d --build`.

Open `http://localhost:8080`. `/health` is a stateless application-liveness probe; `/ready` is a stateless check of cache access and Marvel credential presence. Neither starts a session. Readiness does not check PostgreSQL, authenticate with Marvel or establish upstream availability. The Compose FPM healthcheck verifies a local TCP connection to port 9000.

## Backend validation

The `app` service uses the `application` target with Composer `--no-dev`. PHPUnit and Pint are available in the separate `testing` target:

```powershell
docker build --target testing -t marvel-heroes-testing .
docker run --rm --network none marvel-heroes-testing php -r 'putenv("APP_KEY=base64:".base64_encode(random_bytes(32))); require "vendor/phpunit/phpunit/phpunit";'
docker run --rm --network none marvel-heroes-testing php vendor/bin/pint --test
docker compose config --no-env-resolution --quiet
```

The test key is generated only in the process, never printed, and discarded after execution. Tests use fake upstream responses and an in-memory cache; they do not consume Marvel quota or verify Redis concurrency. Rebuild the image after PHP changes.

### Local HTTP transport validation

The opt-in `tests/Transport` suite uses the real Laravel/Guzzle cURL transport against a disposable PHP server on an ephemeral loopback port. After rebuilding the `testing` image, run it in a container without external networking:

```powershell
docker run --rm --network none --env TEST_MARVEL_TRANSPORT=1 marvel-heroes-testing php -r 'putenv("APP_KEY=base64:".base64_encode(random_bytes(32))); require "vendor/phpunit/phpunit/phpunit";' -- tests/Transport
```

The suite requires cURL and explicitly checks that the cache is in memory before flushing it. It uses synthetic credentials, no `.env` mount, no published ports and no real Marvel calls. Its server process and temporary files are removed after each test. Without `TEST_MARVEL_TRANSPORT=1`, these tests skip and remain outside the default suites.

These checks cover real redirects, read timeouts, retries and safe failure recovery through the catalog API. A generous elapsed-time watchdog detects gross local regressions; it is not an end-to-end latency guarantee. This suite does not establish production DNS/TLS behavior, Marvel availability or quota, Redis contention or refreshes outliving their lease. Run Redis and Nginx/FPM validation separately as described below.

### Redis concurrency validation

The separate `tests/Integration` suite runs catalog HTTP requests in independent PHP processes against real Redis. It is intentionally outside the default PHPUnit suites. Run it explicitly after building the `testing` image:

```powershell
$redisName = 'marvel-heroes-redis-test-' + [guid]::NewGuid().ToString('N')
docker run --detach --rm --network none --name $redisName redis:7.4-alpine redis-server --save '' --appendonly no
if ($LASTEXITCODE -ne 0) { throw 'Could not start the isolated Redis container.' }
try {
    docker run --rm --network "container:$redisName" --env TEST_REDIS_HOST=127.0.0.1 marvel-heroes-testing php vendor/bin/phpunit tests/Integration
    if ($LASTEXITCODE -ne 0) { throw 'Redis integration tests failed.' }
} finally {
    docker stop $redisName
}
```

The containers share an isolated network namespace with no external access or published ports. Redis uses no host volumes and is removed when stopped. Never point `TEST_REDIS_HOST` at a development or production instance: although each test uses a unique prefix and never flushes Redis, test entries remain until this disposable instance is removed. No `.env` mount or real Marvel credentials are needed; only the external HTTP boundary is simulated.

The suite verifies cold-cache contention, ownership-safe lock release, stale responses during refresh, reuse of the refreshed entry, and a shared budget across concurrent queries. It also covers two request windows longer than the old 15-second lease: a higher timeout and more HTTP attempts. Workers coordinate through process input/output; the two lease regressions additionally wait 16 real seconds to cross the former Redis expiry boundary. Expect the full integration suite to take roughly one minute locally. The simulated clock advances normally even when shifted forward to age an entry, preserving Laravel's lock timeout behavior. Missing `TEST_REDIS_HOST` skips these tests; a configured but unreachable instance fails them.

These are functional concurrency checks, not a load test. HTTP responses remain simulated: the tests verify that the configured window keeps contenders out beyond the former lease, not that the transport enforces real timeouts. Resource reuse, failed-refresh recovery and negative-cache expiry are checked across separate PHP processes. A terminated-owner scenario waits for the default lease to expire, then verifies recovery without refunding its spent budget; this adds a real-time wait to the suite. It does not validate refreshes exceeding their lease, every crash scenario, Redis outages, or real Marvel timing and responses. See [refresh lock duration](ARCHITECTURE.md#refresh-lock-duration) for the calculation, configuration requirements and remaining limits.

## Frontend validation

```powershell
pnpm install --frozen-lockfile
pnpm run types:check
pnpm run build
pnpm run lint
pnpm run test
```

`resources/js/types/generated/api.d.ts` is generated from the local `docs/openapi.yaml`. After an approved contract change, run `pnpm run types:generate`, review the generated diff and run `types:check` before build/tests. Do not edit generated declarations by hand. A passing type check verifies static alignment, not runtime response validation. The Docker frontend stage also copies the contract and runs `types:check` before building assets.

### Integrated session validation

```powershell
docker build --target testing -t marvel-heroes-testing-identity .
pnpm run test:full-stack
```

The runner creates a uniquely named Docker network, PostgreSQL database and Redis instance with no host volumes. It migrates only that new database, starts the Laravel HTTP kernel on loopback port 4174, and removes its containers/network on completion or failure. Only the application HTTP port is published. Marvel HTTP is simulated in a test-only router; no real credentials or upstream quota are used. `APP_ENV=integration` keeps real CSRF checks enabled, unlike PHPUnit's testing environment. This validates HTTP/session integration, not production Nginx/FPM, HTTPS termination or upstream availability. Do not use this router as a production entrypoint.

Use `FULL_STACK_PORT` for another free port or `FULL_STACK_IMAGE` for a different freshly built testing image. Playwright requires its Chromium installation; an already installed Edge can be selected locally with `$env:PLAYWRIGHT_CHANNEL='msedge'`. Run browser suites sequentially to avoid sharing their compiled asset output. Production session cookies require HTTPS and `SESSION_SECURE_COOKIE=true`; local HTTP defaults must not be carried into production.

### Nginx and PHP-FPM validation

```powershell
docker build --target application -t marvel-heroes-deployment-app .
docker build --target web -t marvel-heroes-deployment-web .
pnpm run test:deployment
```

Rebuild both images after source changes. This separate check uses the existing `application` (Composer `--no-dev`) and `web` targets, their built assets and the real front controller, without application-source bind mounts or the simulated HTTP router. A CLI-only fixture preloads predefined synthetic catalog entries into a fresh Redis instance. PostgreSQL migrations run only on the newly created disposable database; no host data volumes or `.env` files are mounted, and temporary secrets are generated at runtime.

PHP, PostgreSQL and Redis stay on an internal network. Only Nginx also joins an edge network and publishes loopback port `4175`; all test containers and both networks are removed on completion or failure. `FULL_STACK_PORT`, `FULL_STACK_IMAGE` and `FULL_STACK_WEB_IMAGE` override the port and freshly built images. Playwright channel selection follows the integrated session check above. The check covers discovery, SPA deep links, assets, session/CSRF, conditional caching and safe invalid-input responses. Marvel credentials are absent, so uncached queries fail safely without provider calls. HTTPS termination, production Secure cookies, load testing and real upstream availability are not validated.

Redis outage scenarios pause and unpause only the runner-owned Redis container, after checking its generated name and ownership labels. They retain its process and data while verifying stateless liveness, unavailable readiness, safe API/CSRF errors, manual catalog recovery and session preservation without automatic logout replay. Cleanup restores the paused container even when an assertion fails. This does not validate Redis restart/data loss, DNS failures, disconnected networks or high availability; never reproduce the outage against an existing service.

PostgreSQL outage scenarios stop and restart only the identified runner-owned database container. Its temporary volume survives the restart and is removed with that container during final cleanup. The Nginx fixture uses its discovered internal IP to isolate connection failure from Docker DNS changes; this is not a DNS-failure test or a production host configuration. Default Nginx runs use a fresh stack per viewport so identity preparation does not exhaust another project's real rate limits.

The frontend tests cover text formatters, HTTP service cancellation/error mapping, collection request races/reset/disposal, character search/navigation, character detail and story comics loading. The search suite uses real Vue Router memory history and fake timers to verify the 300 ms debounce, query bounds, pagination and back/forward restoration without a DOM. The comics suite uses a reactive story ID and Vue effect scope to verify reloads on ID changes, pagination bounds, cancellation, late responses, empty results, error recovery and disposal. The detail suite verifies independent character/story loading and errors, ID changes, cancellation, obsolete responses, disposal, recovery and empty stories through the composable's exposed state. Its pagination tests cover story-only requests, page bounds, actions during loading, resets on character changes and recovery from a failed page. Controlled promises and a fake Axios transport keep the tests deterministic and offline. Mounted-page navigation, status rendering, keyboard accessibility and responsive visual behavior are checked separately by the browser suite below. Passing unit tests or the build alone is not evidence of complete browser workflows.

The separate `useCharacterDetail.retry.test.ts` suite covers manual story retries on the first and subsequent pages, preservation of the character and pagination, redundant-action guards, repeated failure and cancellation on character changes or disposal. It uses the same simulated HTTP boundary and does not verify button rendering, focus behavior or browser interaction.

`useStoryComics.test.ts` also covers manual retries on first/later comic pages, actions without an error or during loading, and recovery via previous-page navigation after repeated failures. Button/pagination rendering and keyboard focus are checked separately by the browser suite below.

`useCharacterCatalog.test.ts` covers manual catalog retries with the applied URL parameters, local-validation and loading guards, preserved back navigation, and an in-progress retry superseded by the draft search's debounce. These tests use memory history and simulated HTTP; they do not verify the rendered retry button or keyboard focus.

### Browser validation

```powershell
pnpm exec playwright install chromium
pnpm exec playwright test --workers=2
```

Alternatively, with Microsoft Edge installed, set `$env:PLAYWRIGHT_CHANNEL = 'msedge'` before running the tests. The suite builds production assets and starts its own test server on port 4173; this is not a development instance of the Laravel API. Requests and image responses are simulated, so no `.env`, Marvel credentials or Redis instance are needed. Desktop, mobile and narrow viewports are configured in `playwright.config.ts`. Do not run another frontend build while this suite is active: both use `public/build`. Screenshots, traces on failure and reports stay in ignored output directories.

## Cache warmup

```powershell
docker compose run --rm app php artisan marvel:cache:warm
```

This operator command may call Marvel and consume the configured budget. It uses `MARVEL_WARM_QUERIES` unless repeatable `--query` options replace that list, and reuses fresh cache entries without forcing refresh. Without configured queries or explicit overrides, it performs no warmup.

To warm only the unfiltered initial catalog (page one, 20 items), explicitly pass an empty query:

```powershell
docker compose run --rm app php artisan marvel:cache:warm --query=
```

Repeat `--query` to include named searches in the same override list. The command does not preload subsequent pages or automatically add the initial catalog to configured searches.

Preview the normalized, deduplicated list before executing:

```powershell
docker compose run --rm app php artisan marvel:cache:warm --query= --query="Spider-Man" --dry-run
```

`--dry-run` validates and prints the plan without upstream requests or cache changes. Its count is unique queries, not an estimate of quota usage: actual calls depend on fresh cache and bounded retries. Empty queries select the initial catalog; other prefixes must contain 2-100 characters after trimming. The entire list is validated before work starts, and equivalent lowercase queries are executed once.

Execution reports fresh, stale and failed entries separately. Fresh includes reuse of an existing fresh entry; it does not imply an upstream call or forced refresh. Stale fallback emits a warning, not a claim of successful refresh. Known source/budget/lock failures do not prevent later queries from using available cache, and diagnostics remain safe. Exit `0` means every planned query is available (possibly stale), or the plan is empty/dry-run; `1` means at least one query is unavailable; `2` means invalid input with no queries executed.

## Upstream timeout

`MARVEL_TIMEOUT_SECONDS` must resolve to a positive integer number of seconds (default: `5`). Zero or negative effective values block upstream requests before any HTTP attempt or budget reservation. Existing fresh or valid stale cache can still serve the catalog; an uncached request returns `502` with `upstream-unavailable`, without exposing the configuration error. After correcting local configuration, reload the application/configuration cache as appropriate for the environment. This check runs when the client needs upstream data, not at startup or in `/ready`.

## Identity connection timeout

The PostgreSQL PDO connection uses `DB_CONNECT_TIMEOUT` in integer seconds, defaulting to `2`, with an effective minimum of `2` via `PDO::ATTR_TIMEOUT`. Values below that minimum cannot disable the limit. This bounds connection establishment per attempt/host, not query execution, DNS resolution or the total HTTP request; Laravel may attempt a reconnect. Change runtime configuration and reload/rebuild the application configuration cache as appropriate, without rotating credentials. An unavailable identity store returns the existing private `503` problem response once the driver reports failure; authentication mutations are never automatically replayed.

## Redis availability

When PhpRedis reports a dependency failure, API routes and `/sanctum/csrf-cookie` return `503 application/problem+json` with code `dependency-unavailable` and a correlated `request_id`. Identity responses remain `private, no-store`. The application does not bypass cache, budget, authentication or rate limiting to keep serving requests; the stateless liveness probe remains available, and readiness returns `503` with `status: not_ready` when its cache check fails. Readiness still requires configured Marvel credentials after recovery.

Both PhpRedis connections use explicit connection and read timeouts, each defaulting to one second, with command retries disabled (`max_retries=0`). Operators can set `REDIS_CONNECT_TIMEOUT` and `REDIS_READ_TIMEOUT` to positive seconds, including fractions; do not use zero or negative values to disable these bounds. After changing runtime configuration, reload the application and rebuild its configuration cache as appropriate for the environment.

These are per-operation limits, not an end-to-end response-time guarantee: DNS resolution, scheduling and multiple Redis operations can still add latency before the driver reports a failure. The catalog offers manual retry rather than automatic polling; identity mutations are not automatically replayed. Retained Redis data can become usable again after connectivity recovers, but this does not guarantee survival of data loss or a Redis restart. Safe technical events retain request correlation without raw Redis connection diagnostics or signed Marvel transport exception chains.

## Current scope

Catalog endpoints are public and rate-limited. First-party Sanctum sessions and PostgreSQL identity persistence are implemented as described in [AUTHENTICATION.md](AUTHENTICATION.md); external-client tokens, email verification and password reset remain deferred. See [ARCHITECTURE.md](ARCHITECTURE.md) for cache and client limitations.
