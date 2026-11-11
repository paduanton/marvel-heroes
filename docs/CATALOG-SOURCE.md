# Catalog source transition

## Why the source changed

The project treats the original Marvel Comics API as retired. An authenticated
smoke test against that service is no longer an acceptance criterion. This is
the comics API, not the unrelated Marvel App design platform.

For this portfolio, the goal is to preserve the usable application when a
provider disappears: keep the Laravel `/api/v1` contract, the Vue client and
Sanctum identity independent of the provider. Search, detail and verified
relationships must remain demonstrable without external credentials. Unknown
legacy IDs must not resolve to unrelated records.

## Optional live metadata

[Metron](https://metron.cloud/) replaces the original Marvel Comics API for
live comic search and detail. Comic Vine was not selected because the evaluated
search could not guarantee publisher filtering and exact totals together.
Character discovery and verified story links continue to use the local snapshot.
Live appearances are available only for characters with a unique exact Grand
Comics Database cross-reference; otherwise the curated links remain available.
The original Marvel transport remains only for isolated regression fixtures.

The default is `CATALOG_PROVIDER=local`, with no credentials. To opt in, set
`CATALOG_PROVIDER=metron` and inject `METRON_API_TOKEN` into PHP through the
ignored local `.env` or the deployment secret manager. The token is only sent
as a Bearer credential to the fixed HTTPS Metron origin; it is unrelated to
Sanctum. Roll back by restoring `CATALOG_PROVIDER=local`, with no migration
or cache flush. Live issue IDs do not silently redirect to local editions.

Metron searches by series and filters by verified Marvel publisher ID. Redis
holds normalized metadata, not upstream responses. Nonempty results are fresh
for 30 days and eligible for stale fallback for up to 180 days from refresh;
empty lookups are kept for 15 minutes. The default application budget is 15
requests per rolling minute and 4,000 per rolling day, shared across resources.
Metron's [account limits and cooldown headers](https://github.com/Metron-Project/metron/blob/master/api/RATELIMIT.md)
still apply. Start a new search with `source=local` to bypass live lookups.

Metron metadata is adapted under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/);
this license applies to the adapted metadata, not application code.
The [provider's reuse guidance](https://metron-project.github.io/blog/commercial-api-use)
excludes covers. The adapter does not expose or cache cover URLs or third-party
descriptions. The vitrine uses its own illustrative covers instead.

## Curated snapshot v1

[Grand Comics Database](https://www.comics.org/) contributed the bibliographic
metadata adapted in [gcd-v1.json](../resources/catalog/gcd-v1.json), under
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The same
license applies to the adapted snapshot data, not to the application code.

- Version: `1`. SHA-256 (UTF-8 with LF): `aa3023446eabeaacdaedecd72f822d1f60346513e5ceed1e54948157da677ad7`.
- Scope: 40 regular issues in four Marvel series, four characters and four indexed comic stories. Records were selected from the official GCD series, character and issue pages linked in the snapshot. The full authenticated dump was not used.
- Adaptations: selected facts only, normalized titles and dates, and a separate numeric ID range. A character-to-issue link is present only when an indexed story confirms the appearance; it does not represent complete coverage.
- No cover scans, descriptions or prices were copied. A missing image is null. [GCD's data policy](https://github.com/GrandComicsDatabase/gcd-django/wiki/FAQ) treats cover rights separately.

The adapter reads the bundled snapshot without network access. Update the
provenance, version and checksum when replacing it, and keep existing IDs
stable. The snapshot is not an archive or redistribution of Comic Vine or
Marvel API responses.
