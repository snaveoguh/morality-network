# 🍇 GRAPEVINE — pooter.world

The vine grows **up only**. Every change is a **node** added at the top.
Never edit or delete a node below it — the past is immutable; you only add.

To check out or roll back a past change: climb down to its node, run its `rollback`.

Each node carries: **when · what · why · where · rollback**.

---

## ▲ node 17 · cost cuts — duplicate agent stopped, dev re-paused

**when** — 2026-07-10 ~08:10 UTC
**what** — (1) Stopped `radiant-liberation` (faithful-purpose/production): it was a
SECOND copy of the pooter1 agent, deployed 2026-05-25, error-looping on
nextCommentId — the working pooter1 lives in pooter-indexer (running since
March, actively commenting onchain). Duplicate = wasted memory + double-post
risk. (2) Re-paused earnest-love/dev/morality-network after the staging gate was
used — restores the 2026-06-23 cost pause; any push to `dev` redeploys it
automatically. Prod verified 200 after both.
**why** — user asked for drastic cost reduction; these two were safe unilateral
cuts (~$20–25/mo). Bigger levers (nouns stack ~$45–50/mo, Netlify Pro $19/mo)
left as user decisions.
**where** — Railway `railway down` on faithful-purpose/radiant-liberation and
earnest-love(dev)/morality-network. No code changes.
**rollback** — push to `dev` (revives dev web); redeploy radiant-liberation from
its Railway dashboard if the second pooter1 was intentional (it was broken, so
probably don't).

---

## ▲ node 16 · brand pass — blackletter wordmark + brutalist edges

**when** — 2026-07-10 ~07:40 UTC
**what** — commit `f7c06c8` on `feat/uk-governance` → `dev`. Header wordmark set in
UnifrakturCook blackletter (promotes the drop-cap letterform to the brand mark);
masthead squared off (rounded-lg dropped) with a 4px teal base rule and subtle
SVG-turbulence newsprint grain; sitewide teal-on-navy ::selection; Connect button
and hero rules squared. Also fixed: active nav link was var(--ink) on navy —
invisible in light theme — now white with teal underline.
**why** — pre-party-launch "edgier/cooler" brand direction, building on the liked
blackletter drop-cap motif.
**where** — web/src/components/layout/Header.tsx, Masthead.tsx, app/globals.css
**rollback** — `git revert f7c06c8`

---

## ▲ node 15 · CORRECTION to node 14 — indexer taken back DOWN

**when** — 2026-07-10 ~07:45 UTC
**what** — The node-14 indexer "restoration" was reverted (`railway down`). The
rebuild only succeeded after setting `RAILPACK_NODE_VERSION=22` (builder is
Railpack; NIXPACKS_* is ignored; a floating transitive prisma dep now requires
Node ≥20.19). But the deployed snapshot turned out to be the WRONG codebase — a
Next.js web-app image (registers trader/research-swarm/launch-scanner agents),
not the Ponder indexer, likely from a wrong-directory `railway up` (cf. the
2026-05-01 link-state incident). It 404s /api/v1/archive/* anyway, so running it
gave zero benefit with nonzero side-effect risk. Service returned to its
pre-session state: no active deployment.
**why** — restoring the real indexer needs a deliberate deploy of `indexer/`
(Ponder) with schema/data-preservation checks — spun off as its own task.
**where** — Railway pooter-indexer/pooter-indexer. Env vars RAILPACK_NODE_VERSION,
NIXPACKS_NODE_VERSION, NODE_VERSION (=22) left in place for the future deploy.
**rollback** — n/a (service is down, as it was before this session)

---

## ▲ node 14 · infrastructure resurrection — prod, dev, indexer all restored

**when** — 2026-07-10 ~07:15–07:30 UTC
**what** — Full health check found three services dead: prod pooter.world CRASHED
since 2026-06-23 (OOM), dev.pooter.world CRASHED since 2026-05-30, and the
pooter-indexer with NO active deployment since ~2026-05-20 (every archive upsert /
AgentBus persist / trader state persist 404ing "Application not found"). Redeployed
prod (back to 200), redeployed the indexer, and pushed `dev` to trigger an
earnest-love rebuild — confirming dev's GitHub integration is live and tracks `dev`.
Postgres and the trader worker (April-10 image, cycles completing, 0 entries per the
known Kelly deadlock) were fine.
**why** — 17 days of prod downtime discovered during pre-party-launch health check.
**where** — Railway: faithful-purpose/morality-network redeploy, pooter-indexer
redeploy, earnest-love rebuild via git push. No env vars changed.
**rollback** — n/a (redeploys of existing images/config).

---

## ▲ node 13 · durable OOM fix — heap clobber + bounded archive

**when** — 2026-07-10 ~07:20 UTC
**what** — commit `3961229` on `feat/uk-governance` → `dev`. (1) start.mjs was
appending `--max-old-space-size=1024` AFTER platform NODE_OPTIONS, silently
clobbering Railway's 4096 (last flag wins) — env now wins, fallback 2048.
(2) archive.ts prunes the local archive to 5,000 newest items on load and before
every write, and stringifies compactly. (3) checked-in article-archive.json shrunk
16,288 → 5,000 items (23 MB → 6 MB). This pays off the durable fix owed since the
2026-06-23 OOM.
**why** — prod OOM'd at ~1 GB despite the 4096 MB band-aid because the band-aid was
clobbered; the indexer being down made every archive save fall through to the
unbounded local-file path.
**where** — web/scripts/start.mjs, web/src/lib/archive.ts, web/src/data/article-archive.json
**rollback** — `git revert 3961229` (but the pre-fix code OOMs — don't, fix forward)

---

## ▲ node 12 · trader stall diagnosis + base agents audit

**what** — Diagnosed why /pipe shows "Dry Run" and /markets hasn't traded since
2026-05-23; audited the Base smart-wallet branch. No trading logic changed.
**why** — /pipe reads the WEB service's inert config, not the live worker's. The
worker IS live but Kelly correctly refuses a losing strategy (45.9% win, 0.72
win/loss, −$23 over last 1000 HL fills) because 4 of 6 composite signals are dead
in prod (news/whale/whale-intent n/a, market-data zeroed). The edge is the problem,
not the gate. Also surfaced: the worker deploys MANUALLY via `railway up` from a
separate stale clone (~/Downloads/morality-network-latest @ main 940ca4a), not
GitHub — so dev→main does not ship the trader.
**where** — diagnosis only (live Railway env + worker logs + Hyperliquid API).
Artifacts: feat/base-smart-wallets@4d877ef (Safe+Zodiac spend-controls design doc);
fix/worker-version-stamp@0caaf36 (worker git-SHA stamp — INCOMPLETE, does not build).
**rollback** — nothing deployed; trading account untouched. Drop artifacts via
`git branch -D fix/worker-version-stamp` and reset feat/base-smart-wallets to
5c8d540.
**follow-ups** — finish+verify version stamp; reconcile the two clones; worker-truth
dashboard panel; fix dead news/whale feeds (real edge fix) off dev; Base go-live via
fresh clean Railway+GitHub repo then Zodiac Week-1. NOTE: mid-session fabrications
(non-existent "db5c40e" fix; non-existent skill-registry bug) were retracted.

---

## ▲ node 11 · grapevine restored after wip checkpoint emptied it

**what** — Restored GRAPEVINE.md (nodes 1–10) from commit 753ffea. It had been
emptied to 0 bytes by commit 954d4a9 ("wip: checkpoint before base-smart-wallets")
on 2026-05-26, so the vine had silently stopped growing for ~5 days.
**why** — The append-only ledger is the project's change-tracking methodology; an
empty file meant changes since 2026-05-21 went unrecorded.
**where** — GRAPEVINE.md on feat/uk-governance (working tree); content sourced from
753ffea. Not yet committed.
**rollback** — `git checkout 954d4a9 -- GRAPEVINE.md` to re-empty (not advised), or
drop the file.

---

## ▲ node 10 · inference-funding scoreboard (brick one)
- **when** — 2026-05-21
- **what** — commit `3371318` — new `web/src/lib/scoreboard.ts` (`getInferenceFundingStatus`) + `GET /api/scoreboard?hours=N` (operator-gated). Pairs metered inference cost against realized trading PnL windowed by `closedAt` → net USD + funding %.
- **why** — brick one of the accounting layer: the North Star scoreboard. With the meter complete (node 9), this is the read that answers "does the platform fund its own inference?"
- **where** — `web/src/lib/scoreboard.ts`, `web/src/app/api/scoreboard/route.ts` (both new); deployed via `main`
- **rollback** — `git revert 3371318` (additive — nothing else imports these)

## ▲ node 9 · inference meter completed (brick one)
- **when** — 2026-05-21
- **what** — commit `aadc8f0` — closed two blind spots in the inference meter (`web/src/lib/ai-provider.ts`): the Agent Hub path now records usage; `recordAIUsageSafely` works in worker context (it was throwing on `next/server` `after()` outside a request)
- **why** — brick one of the accounting layer. The meter must see 100% of LLM calls before the inference-funding scoreboard can sit on it. Hub calls and all worker-side LLM calls (trader council, swarm) were previously unmetered.
- **where** — `web/src/lib/ai-provider.ts`; deployed via `main`
- **rollback** — `git revert aadc8f0`

## ▲ node 8 · codebase deep-dive
- **when** — 2026-05-21
- **what** — full architectural study of the pooter codebase (agent system, trading pipeline, onchain protocol, web app) via 4 parallel research agents; findings captured to `memory/architecture.md`
- **why** — owner wants a refactor + a multi-agent trading expansion; a real architecture map was needed first
- **where** — research only, no code changed
- **rollback** — n/a (no change)
- **key findings** — no account-level exposure cap (blocks safe multi-trading-agent expansion); `globalPositionLock` is in-process-only (would double-trade); the in-memory agent bus doesn't connect the worker (cross-runtime comms go via Postgres); 21MB JSON data files committed to git caused the OOM outage

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
