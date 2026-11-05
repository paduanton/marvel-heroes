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

## Automated Dependency Pull Requests

Include this maintenance step in stage 7 hardening and every subsequent dependency update:

1. Before updating packages, list this repository's open automated dependency PRs. Check the author, target branch, affected packages, requested versions and complete diff; record the PR numbers relevant to the increment.
2. Compare each relevant PR with the planned manifest and lockfile changes. Distinguish updates to implement, updates already covered, and updates deferred for a separate decision. Major upgrades and overrides retain the approval requirements in `AGENTS.md`.
3. Run the applicable audits and tests, then publish only explicitly approved commits. Recheck the PRs against the published target branch; a similar title or package name alone does not establish that a PR has been replaced.
4. Propose closing only PRs whose complete update is already covered or superseded by the published changes. Name each PR, its reason for closure and the replacing commit. Obtain explicit approval for those PR numbers, then add a concise explanatory comment and close them. Commit or push approval alone does not authorize PR closure. Keep still-needed or deferred PRs open, and handle merging useful PRs as a separate approved action.
