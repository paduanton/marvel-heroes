# Contributing

## Workflow

Read `AGENTS.md`, `CONTEXT.md`, the relevant ADR, and `docs/openapi.yaml` before a change. Implement one testable slice, run its checks, and present the commit suggestion required by `AGENTS.md`. Never stage or commit without explicit user approval.

## Commit Messages

Use Conventional Commits:

```text
type(scope): concise imperative summary
```

Examples:

```text
feat(characters): add cached catalog endpoint
fix(cache): preserve stale catalog data on timeout
test(api): cover invalid pagination input
docs(agents): document incremental handoff protocol
```

Keep each commit narrowly scoped, independently reviewable, and supported by applicable tests. Do not combine a feature with opportunistic refactoring or broad formatting.
