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

## Frontend validation

```powershell
pnpm install --frozen-lockfile
pnpm run build
pnpm run lint
pnpm run test
```

The current frontend tests cover text formatters. End-to-end navigation, cancellation races, accessibility and responsive visual behavior still require dedicated coverage. Passing the build is not evidence of those workflows.

## Cache warmup

```powershell
docker compose run --rm app php artisan marvel:cache:warm
```

This operator command may call Marvel and consume the configured budget. It uses `MARVEL_WARM_QUERIES`, accepts repeatable `--query` overrides, and reuses fresh cache entries. It does not force refresh and currently skips the empty query, so it does not warm the unfiltered initial catalog.

## Current scope

Catalog endpoints are public and rate-limited. Sanctum and identity persistence are planned in [AUTHENTICATION.md](AUTHENTICATION.md), not implemented. See [ARCHITECTURE.md](ARCHITECTURE.md) for cache and client limitations.
