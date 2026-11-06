# Marvel Heroes API in Postman

The [collection](marvel-heroes.postman_collection.json) exercises our REST API,
not the retired Marvel API or its replacement candidates. The [OpenAPI
contract](../openapi.yaml) is authoritative. Public examples are synthetic.

## Run catalog reads

Import the collection and the [local environment template](local.postman_environment.json)
into Postman, select the environment, and use the Collection Runner in order.
`base_url` is the scheme and host (plus port), without a trailing slash or
`/api/v1`. The collection defaults to the placeholder `https://api.example.test`.
The template points to the local application in [the setup guide](../DEVELOPMENT.md).

The run discovers character, story and comic IDs and the comic ETag dynamically.
It checks pagination, source selection, problems, and conditional requests.
Examples document `429` and `503` without exhausting quotas or stopping services.
For a single request with a variable ID or ETag, fill it with a value from
your own local response rather than expecting a prior Runner's values to persist.

## Verify identity in an isolated stack

With Docker, Node, the pinned pnpm and Postman CLI installed, run:

```powershell
pnpm run test:postman
```

On Windows with an npm-installed Postman CLI, set `POSTMAN_CLI` to the full
path of the native `postman.exe` if it isn't directly available on PATH.
`FULL_STACK_PORT` can override the runner's loopback port (default 4176).
The runner creates and removes its own Redis and PostgreSQL, uses the local
catalog and never needs upstream keys. Its write requests require the explicit
`allow_identity_writes=true` flag and an HTTP loopback origin with a port. Do
not enable them against a personal or persistent installation.

The identity folder uses a new disposable identity, Postman's cookie jar,
and the decoded `XSRF-TOKEN` in `X-XSRF-TOKEN`. It verifies registration, login,
`/me`, logout and private cache headers. Password and CSRF values exist only
in the run; no Bearer token or shared environment is required.

## Publish a revision

Run the collection locally and review the diff against OpenAPI. Import only the
collection into the dedicated public workspace and preview the documentation
without attaching an environment. Never save live responses, request cookies,
credentials, or private origins as examples. Check both public links signed
out. Do not convert an existing private workspace to public.
