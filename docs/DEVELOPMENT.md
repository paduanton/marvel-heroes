# Development

## Requirements

- Docker Desktop with the Linux container engine running.
- Marvel public and private credentials for real catalog requests.
- Node 22+ and the pnpm version pinned in `package.json` for host-side frontend checks.

Local secrets belong in the ignored `.env`. The example contains names and defaults only. Application code reads configuration; production secrets must be injected at runtime into PHP. No Marvel credentials are required for the isolated tests below.

## First local setup (PowerShell)

Run from the repository root. Create `.env` only if it does not already exist:

```powershell
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
docker compose build
docker compose run --rm --no-deps --user root --volume "${PWD}/.env:/var/www/html/.env" app php artisan key:generate --force
docker compose up -d
```

Set `MARVEL_PUBLIC_KEY` and `MARVEL_PRIVATE_KEY` in the local `.env` before starting real catalog requests. For installations using the old names, replace `MARVEL_PUBLICKEY`, `MARVEL_PRIVATEKEY`, and `MARVEL_URL` with `MARVEL_PUBLIC_KEY`, `MARVEL_PRIVATE_KEY`, and `MARVEL_BASE_URL`.

The one-off key-generation command mounts the host `.env` explicitly so the generated key survives container removal. Use it for a new installation; an existing installation keeps its current `APP_KEY`. Subsequent starts use `docker compose up -d --build`.

Open `http://localhost:8080`. `/health` checks application liveness; `/ready` checks access to the configured cache and whether Marvel credentials are present. It does not authenticate with Marvel or establish upstream availability. The Compose FPM healthcheck verifies a local TCP connection to port 9000.

## Backend validation

The `app` service uses the `application` target with Composer `--no-dev`. PHPUnit and Pint are available in the separate `testing` target:

```powershell
docker build --target testing -t marvel-heroes-testing .
docker run --rm --network none marvel-heroes-testing php -r 'putenv("APP_KEY=base64:".base64_encode(random_bytes(32))); require "vendor/phpunit/phpunit/phpunit";'
docker run --rm --network none marvel-heroes-testing php vendor/bin/pint --test
docker compose config --no-env-resolution --quiet
```

The test key is generated only in the process, never printed, and discarded after execution. Tests use fake upstream responses and an in-memory cache; they do not consume Marvel quota or verify Redis concurrency. Rebuild the image after PHP changes.

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

These are functional concurrency checks, not a load test. HTTP responses remain simulated: the tests verify that the configured window keeps contenders out beyond the former lease, not that the transport enforces real timeouts. They do not validate refreshes exceeding the newly calculated lease, process crashes, Redis outages, or real Marvel timing and responses. See [refresh lock duration](ARCHITECTURE.md#refresh-lock-duration) for the calculation, configuration requirements and remaining limits.

## Frontend validation

```powershell
pnpm install --frozen-lockfile
pnpm run build
pnpm run lint
pnpm run test
```

The frontend tests cover text formatters, HTTP service cancellation/error mapping, and collection request races and scope disposal. Controlled promises and a fake Axios transport keep these tests deterministic and offline. End-to-end navigation, search debounce, page-specific request lifecycles, accessibility and responsive visual behavior still require dedicated coverage. Passing these tests or the build is not evidence of complete browser workflows.

## Cache warmup

```powershell
docker compose run --rm app php artisan marvel:cache:warm
```

This operator command may call Marvel and consume the configured budget. It uses `MARVEL_WARM_QUERIES`, accepts repeatable `--query` overrides, and reuses fresh cache entries. It does not force refresh and currently skips the empty query, so it does not warm the unfiltered initial catalog.

## Upstream timeout

`MARVEL_TIMEOUT_SECONDS` must resolve to a positive integer number of seconds (default: `5`). Zero or negative effective values block upstream requests before any HTTP attempt or budget reservation. Existing fresh or valid stale cache can still serve the catalog; an uncached request returns `502` with `upstream-unavailable`, without exposing the configuration error. After correcting local configuration, reload the application/configuration cache as appropriate for the environment. This check runs when the client needs upstream data, not at startup or in `/ready`.

## Current scope

Catalog endpoints are public and rate-limited. Sanctum and identity persistence are planned in [AUTHENTICATION.md](AUTHENTICATION.md), not implemented. See [ARCHITECTURE.md](ARCHITECTURE.md) for cache and client limitations.
