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

[Comic Vine](https://comicvine.gamespot.com/api/) is the preferred live candidate
and [Metron](https://github.com/Metron-Project/metron/blob/master/api/README.md)
is the alternative. Live integration is pending authenticated capability checks
and permission to publish normalized metadata, display covers and retain cache.
The local adapter is ready for integration. No replacement live service is enabled.

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
