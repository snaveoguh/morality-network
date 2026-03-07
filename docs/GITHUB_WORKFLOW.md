# GitHub Workflow

Repository: [snaveoguh/morality-network](https://github.com/snaveoguh/morality-network)

## Branching

- Branch per deliverable or tightly related bundle.
- Branch naming convention:
  - `feat/B-005-governance-live-endpoint`
  - `fix/D-001-extension-link-interaction`
  - `docs/G-001-api-reference-refresh`

## Commit Convention

Use deliverable IDs in commit title.

Format:

`<type>(<area>): <ID> <short summary>`

Examples:
- `feat(indexer): B-005 add governance live endpoint`
- `fix(extension): D-001 prevent link click hijack`
- `docs(docs): G-001 document indexer API examples`

## Pull Request Template (Recommended)

Title:
- `[B-005] Governance live endpoint`

Description:
1. Deliverables covered: `B-005`, `E-003`
2. What changed:
3. Acceptance criteria checklist:
4. Validation evidence:
5. Risks and rollback:
6. Docs updated:

## Release Notes Discipline

For each merged PR:
- Add a one-line entry in `STATUS_LOG.md`.
- Add/adjust endpoint docs if API changed.
- Add migration/config note if env vars changed.

## Merge Rules

- Squash merge preferred for clean history.
- No merge without docs for public-facing changes.
- No merge without validation evidence.

## Suggested GitHub Project Columns

1. Backlog
2. Ready
3. In Progress
4. Review
5. Blocked
6. Done

Card title format:
- `[ID] short description`
