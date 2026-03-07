# Next Actions (Methodical Sequence)

## Active Sequence

1. `B-001` Stabilize indexer runtime with persistent DB + reachable RPC.
2. `B-005` Implement and validate `/api/v1/governance/live`.
3. `E-001` Migrate web feed data source to indexer global feed API.
4. `E-003` Migrate proposal rail to governance live endpoint.
5. `D-001` + `D-002` Extension interaction reliability pass.

## For Each Step

- [ ] Implement
- [ ] Validate locally
- [ ] Update docs
- [ ] Update `STATUS_LOG.md`
- [ ] Commit with deliverable ID
- [ ] Open PR with acceptance checklist

## Current Blockers to Clear First

- Reachable RPC for indexer runtime in this environment.
- Persistent DB target for non-ephemeral indexing.
- PR workflow alignment while parallel feature work lands.
