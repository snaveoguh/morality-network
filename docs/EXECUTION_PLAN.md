# Execution Plan (No Scope Cuts)

This plan is built for full-scope delivery through controlled sequencing and clear acceptance gates.

## Principles

1. No scope reduction.
2. One source of truth for status (`DELIVERABLES_MASTER.md`).
3. Every deliverable must have measurable acceptance criteria.
4. Merge only when docs and implementation remain in sync.
5. Weekly planning, daily execution, and frequent GitHub updates.

## Cadence

- `Daily`: execution log update + PR summary + blocker report.
- `2x per week`: backlog grooming and reprioritization.
- `Weekly`: milestone review and dependency unblock decisions.

## Delivery Phases

## Phase 1: Core Reliability Foundation

Targets:
- `B-001`, `H-001`, `H-002`, `A-002`, `A-003`

Exit criteria:
- Indexer sync is stable and restart-safe.
- CI coverage exists for all critical paths.
- Runtime health and lag metrics are observable.

## Phase 2: Unified Data Product

Targets:
- `B-005`, `B-006`, `C-001..C-007`

Exit criteria:
- Governance and news ingestions normalize to canonical schema.
- Feed API supports high-volume filtering and tagging.

## Phase 3: Product Surface Consolidation

Targets:
- `E-001..E-004`, `D-001..D-005`

Exit criteria:
- Web and extension both consume same indexed APIs.
- UX friction reduced with verifiable interaction success metrics.

## Phase 4: Trust and Market Readiness

Targets:
- `F-001..F-004`, `G-001..G-004`, `H-003`, `H-004`

Exit criteria:
- Abuse controls and moderation signals are active.
- Public API is documented, keyed, and monetization-ready.
- Incident and rollback procedures are operational.

## Working Agreement for PRs

Each PR must include:
- Deliverable IDs touched (e.g. `B-005`, `E-003`).
- Acceptance criteria checklist.
- Migration/config changes.
- Documentation diffs.
- Validation evidence (tests, local runs, screenshots if UI).

## Change Gate

A deliverable can move to `Done` only when:
1. Acceptance criteria are all checked.
2. Docs updated in `v2/docs`.
3. Validation evidence is attached.
4. At least one reviewer signs off.

## Blocker Handling

When blocked:
1. Set status to `Blocked` in tracker.
2. Add blocker detail + dependency in `STATUS_LOG.md`.
3. Create mitigation path or fallback task within 24h.
