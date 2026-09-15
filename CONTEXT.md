# Marvel Heroes Context

## Purpose

Marvel Heroes is a public catalog for discovering Marvel characters and exploring their related stories and comics. It is a read-only product: the visitor does not own or edit catalog data.

## Working Agreement

The user requested continuous progress on the development plan after each interaction, including after approved Git actions. Read the authoritative continuation and approval rules in `AGENTS.md`, under Increment Protocol, when resuming work or deciding whether approval is required.

## Glossary

| Term | Meaning |
| --- | --- |
| Catalog | The paginated collection of discoverable characters. |
| Character | A Marvel character represented by an id, name, description, image, and modification date. |
| Story | A narrative record related to a character; it may expose related comics. |
| Comic | A comic record related to a story. |
| Upstream | The external Marvel API, the source of catalog data. |
| Catalog API | This application's stable `/api/v1` interface; it is not the upstream API. |
| Fresh entry | Cached catalog data within its freshness window. |
| Stale entry | Cached catalog data outside freshness but inside its fallback window. |
| Budget | The configurable daily maximum number of upstream calls this application allows itself. |
