# 🍇 GRAPEVINE — pooter.world

The vine grows **up only**. Every change is a **node** added at the top.
Never edit or delete a node below it — the past is immutable; you only add.

To check out or roll back a past change: climb down to its node, run its `rollback`.

Each node carries: **when · what · why · where · rollback**.

---

## ▲ node 7 · /pipe render crash fixed
- **when** — 2026-05-20 ~18:30 UTC
- **what** — commit `6f438b6` — rewrote the `OpenPosition` interface + `PositionEntry` in `web/src/app/pipe/page.tsx` to match the metrics-v2 `TraderOpenPositionMetric` shape
- **why** — `/pipe` tripped its error boundary for operators: `Cannot read properties of undefined (reading 'value')`. `PositionEntry` read the raw Hyperliquid position shape (`coin`, `leverage.value`) but `/api/trading/metrics` returns `{ position: {marketSymbol, direction, leverage:number}, unrealizedPnlUsd }` — `position.leverage` was undefined. Public viewers were unaffected (their `open` array is force-emptied).
- **where** — `web/src/app/pipe/page.tsx`; deployed via `main`
- **rollback** — `git revert 6f438b6`

## ▲ node 6 · editions backfilled
- **when** — 2026-05-20 ~17:00 UTC
- **what** — generated today's daily edition ("SIGNAL STATIC") + 7 fresh originals via `POST /api/editorial/pregenerate` (4 + 3, two passes around the 55s route cap)
- **why** — ~8-day editorial gap from the outage; `/originals` and the front page were stale. May 13–19 cannot be authentically recreated (daily editions pull live RSS + hard-stamp "today"), so the gap is filled with fresh pieces, not backdated ones.
- **where** — prod content only — the indexer's `pooter` editorial store. No code change.
- **rollback** — content-only; n/a (delete the editorial hashes from the indexer if unwanted).

## ▲ node 5 · trader misstep + revert
- **when** — 2026-05-20 ~10:00–11:10 UTC
- **what** — wrongly enabled the Hyperliquid trader on `disciplined-serenity` (faithful-purpose); reverted it (Railway deploy `39257216`)
- **why** — `disciplined-serenity` has no `DATABASE_URL`. The trader's real home is `pooter-agent-worker` (pooter-indexer project) — already configured, has the DB. For ~1h two traders ran on HL account `0x38501DEB…0984`.
- **where** — Railway `disciplined-serenity` env vars — restored to `TRADER_EXECUTION_MODE=disabled`, `TRADER_DRY_RUN=true`, `WORKER_TASKS=scanner,swarm,bridge`
- **rollback** — already reverted. Trader kill switch: `railway variables --set 'TRADER_DRY_RUN=true' -s pooter-agent-worker`

## ▲ node 4 · worker build fix
- **when** — 2026-05-20 ~09:50 UTC
- **what** — commit `a9c6297` — added `.js` extensions to two dynamic imports in `web/src/lib/trading/signals.ts`
- **why** — the `disciplined-serenity` worker was CRASHED; `tsc` under Node16 module resolution rejects extensionless relative imports (TS2835)
- **where** — `web/src/lib/trading/signals.ts`; deployed via `main`
- **rollback** — `git revert a9c6297`

## ▲ node 3 · indexer recovery
- **when** — 2026-05-20 ~09:28 UTC
- **what** — redeployed the `pooter-indexer` service (Railway deploy `b85a74db`)
- **why** — crashlooping on `EAI_AGAIN postgres.railway.internal` — a DNS failure, collateral from the Railway platform outage the night before. Postgres itself stayed healthy.
- **where** — Railway `pooter-indexer` project / `pooter-indexer` service. No code change.
- **rollback** — n/a — redeploy of the same commit

## ▲ node 2 · heap fix — prod back up
- **when** — 2026-05-20 ~07:57 UTC
- **what** — commit `540a60a` — `web/scripts/start.mjs`, Node `--max-old-space-size` 1024 → 2048 MB
- **why** — pooter.world had been 502ing for ~11 days; `next-server` was OOM-crashing at the 1024 MB heap ceiling
- **where** — `web/scripts/start.mjs`; deployed via `main` (faithful-purpose / morality-network deploy `ce3f079f`)
- **rollback** — `git revert 540a60a` — but note the pre-fix code OOMs, so don't

## ▲ root · 2026-05-20 · outage recovery session
pooter.world had been down ~11 days (502 / OOM). A Railway platform outage the
night before had also knocked the indexer offline. Local WIP was stashed as
`stash@{0}` ("wip-stash-before-oom-fix-2026-05-19") to work from a clean base.
This file supersedes `~/Downloads/pooter-rollback-2026-05-20.md`.
