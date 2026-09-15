# Agent Workflow

```text
Clarify domain -> inspect code -> research unstable facts -> specify slice
-> write test -> implement -> verify -> review -> suggest commit
-> approval gate for Git -> execute approved Git actions -> resume plan
```

For a change that alters the product language, update `CONTEXT.md`. For a hard-to-reverse trade-off, add an ADR. For a public API change, update OpenAPI and API tests before implementation.

The end of every slice is a report, not a Git action:

When approval is missing, follow the report with an explicit question naming the proposed commit. If the user has already approved this commit or the full named sequence, execute it and report the result without asking again. Follow `AGENTS.md`'s Continuous progress rule to resume the plan after each interaction; Git approval is not a generic gate on otherwise authorized development.

```text
Suggested commit: feat(characters): add catalog search

Summary:
- Adds normalized name-prefix search through the catalog API.

Files changed:
- app/Modules/Characters/Application/ListCharacters.php
- docs/openapi.yaml
```
