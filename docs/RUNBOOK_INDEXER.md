# Indexer Runbook

Deliverable: `B-001` Stable indexer runtime.

## Objective

Run indexer continuously with:
- resilient RPC access
- persistent storage
- predictable restart behavior

## Runtime Modes

### Dev mode (local)

- DB mode: `pglite`
- Command: `npm run dev`

### Staging/Prod mode

- DB mode: `postgres`
- Command: `npm run start`

## Required Environment

From `indexer/.env.example`:

- `PONDER_RPC_URL_1`
- `PONDER_RPC_URL_2` (optional)
- `PONDER_RPC_URL_3` (optional)
- `PONDER_DB_KIND`
- `DATABASE_URL` (if postgres)
- contract addresses

## Preflight Checklist

- [ ] RPC endpoint resolves and responds to `eth_chainId`
- [ ] Contract addresses match deployment docs
- [ ] DB credentials valid (if postgres)
- [ ] `npm run codegen` succeeds
- [ ] `npm run dev` or `npm run start` starts without fatal errors

## Health Checks

Once running:

- `GET /health`
- `GET /ready`
- `GET /status`
- `GET /api/v1/health`

## Common Failure Modes

1. DNS/RPC unavailable
- Symptom: repeated `getaddrinfo` or `fetch failed`
- Action: rotate to fallback RPC URLs, verify network egress

2. PGlite used in `serve` mode
- Symptom: `ponder serve does not support PGlite`
- Action: use `dev` for PGlite, or switch to postgres for `start/serve`

3. Schema/config mismatch
- Symptom: build/codegen errors
- Action: run `npm run codegen`, inspect `ponder.config.ts` and schema changes

## Deployment Notes

- Prefer managed Postgres with backups.
- Set RPC fallback URLs from multiple providers.
- Monitor sync lag and API latency.

## Rollback Plan

1. Revert to previous known-good commit.
2. Re-run `npm run codegen`.
3. Restart indexer with prior env settings.
4. Validate `/ready` and `/api/v1/health`.
