# 🍇 GRAPEVINE — pooter.world

The vine grows **up only**. Every change is a **node** added at the top.
Never edit or delete a node below it — the past is immutable; you only add.

To check out or roll back a past change: climb down to its node, run its `rollback`.

Each node carries: **when · what · why · where · rollback**.

---

## ▲ node 23 · Phase C live + pw masthead — the time machine starts

**when** — 2026-07-10 ~20:30–21:05 local (2026-07-11 ~02:30–03:05 UTC)
**what** — Eight commits `8c9940d..4e3ef9a` through dev → main. (1) Tier 2
backfill: context generalized (pmqs|budget), /api/cron/ledger-backfill
ingests one "Financial Statement" sitting per daily run oldest-first,
self-exhausting over the 20-speech 2010→now corpus; ONS registry gains PSNB
(J5II) + net debt %GDP (HF6X). First live run exposed and fixed two bugs
(4e3ef9a): 51k-char single-contribution speeches now split at sentence
boundaries (verbatim guard still checks the full original), and ingest
attempts are recorded in ledger_ingested_debates (migration 005) so
zero-claim sittings don't retry forever. Re-run: 106 claims from Darling's
2010-03-24 Budget, persisted. (2) /ledger/member/[id] entity pages with the
n≥20 score gate (score withheld, progress shown; checkability rate always
public). (3) Daily Merkle batches (migration 004, lib/ledger/merkle.ts,
06:10 UTC cron) + contracts/src/LedgerAnchor.sol (minimal, non-upgradeable,
compiles; NOT deployed — onchain anchoring awaits deploy + env). (4) Right
of reply: /ledger/dispute form → rate-limited POST, operator moderation via
PUT /api/ledger/dispute, answered disputes display inline. (5) Masthead:
molecule logo sunset, blackletter "pw" on a paper square (inverse-WaPo),
Header.tsx only — PWA icons untouched. Crons: daily backfill 16:30 UTC,
daily anchor 06:10 UTC.
**why** — Phase C per spec: the archive compounds (whoever has 3 years of
scores owns the dataset), scores stay honest (n≥20), tamper evidence
accumulates offchain until the anchor contract deploys, and right-of-reply
is the legal + product loop.
**where** — indexer Postgres (migrations 004+005, additive), web lib/app,
contracts/src, crons.yml, Header.tsx.
**rollback** — revert the eight commits; DROP the two new tables. The
retired /hcp-logo.png asset stays in public/.

## ▲ node 22 · Claim Ledger Phase B — resolution + human review gate, live

**when** — 2026-07-10 ~19:50–20:15 local (2026-07-11 ~01:50–02:15 UTC)
**what** — Five commits `fd02f0a..0820e87` through dev → main, all services
green. Migration 003 applied (ledger_resolutions with the review gate AS A
DB CONSTRAINT — false/partial cannot publish without reviewed_by; evidence
required for any published verdict except unresolved; ledger_disputes for
right-of-reply). Resolution agent (lib/ledger/resolve.ts + sources/): model
chooses among server-fetched records only (Commons divisions incl.
per-member votes; hand-verified ONS series registry), evidence assembled
server-side, unknown citations void the proposal, <0.6 confidence dropped.
Review queue /ledger/review (operator-gated) — the ONLY publication path.
Verdict chips + evidence chains on /ledger. Wednesday 15:00 UTC resolve
cron. docs/LEDGER_VERDICT_TEMPLATE.md ready for the media solicitor.
Fixed in the process (0820e87): postgres-js returns DATE columns as Date
objects — String().slice(0,10) gave "Thu Jul 08" and crashed the resolver;
isoDateOnly() normalizer + regression test. First live pass: 6 resolvable
claims scanned, 1 verdict proposed (Cleverly voting-record claim vs
division 2401), 0 published — awaiting human review, as designed.
**why** — Phase B per spec: verdicts only via document chains + human
sign-off. Solicitor template review should happen before the first
false/partial verdict is approved.
**where** — indexer Postgres (additive DDL), web lib/app, crons.yml.
**rollback** — revert the five commits; migration is additive
(DROP TABLE pooter.ledger_resolutions, ledger_disputes). Unpublishing a
verdict = UPDATE status back to 'proposed'/'rejected'.

## ▲ node 21 · ledger durability: DB + Wednesday cron + nav; worker deploy fixed

**when** — 2026-07-10 ~18:40–18:58 local (2026-07-11 ~00:40–00:58 UTC)
**what** — (1) migration 002 applied to the indexer Postgres via
`railway run node web/scripts/migrate.js` (link verified: faithful-purpose /
production / morality-network; 001 skipped as already recorded). (2) One
manual authorized hit of /api/cron/ledger-pmqs → 43 claims persisted to
pooter.ledger_claims (verified by direct count; 8 distinct member_ids).
(3) `41b3148` — Wednesday 14:00 UTC slot added to .github/workflows/crons.yml
(existing CRON_SECRET GitHub secret; idempotent endpoint) + "Ledger" nav link
after Governance. (4) `c57e706` — fix(worker): two more extensionless dynamic
imports in web/src/lib/trading/signals.ts (TS2835, same class as node 4's
a9c6297) were failing disciplined-serenity's worker:build on every deploy —
the worker had been riding its last good image. All four services green on
c57e706; dev + prod verified.
**why** — without the DB the page re-extracted live every 6h cache expiry and
claim counts drifted between runs; the cron + table make the record stable
and auditable. Worker fix unblocks all future deploys from main.
**where** — indexer Postgres (pooter schema, additive DDL only), GitHub
workflows, Header nav, signals.ts. NOTE: prod may serve the pre-migration
44-claim live snapshot until ~06:35 UTC — Railway's build cache preserves
.next/cache across deploys, so the old unstable_cache entry survives until
its 6h revalidate; it then flips to the DB-backed 43.
**rollback** — migration: `DROP TABLE pooter.ledger_claims` (additive, no
other tables touch it). Cron: remove the two crons.yml lines. Nav: remove
one line in Header.tsx. Worker fix: don't revert — the pre-fix state can't
build.

## ▲ node 20 · Claim Ledger + node-18 work promoted to prod

**when** — 2026-07-10 ~18:37 UTC
**what** — `feat/claim-ledger` fast-forwarded into `dev` (a4f003f→1601782),
validated on dev.pooter.world, then `main` fast-forwarded from `dev`
(36b138e→1601782). Prod auto-deployed via GitHub integration; all four
Railway services green. NOTE: main had never been fast-forwarded for node 18,
so this promotion also carried the rebrand + UK governance + ZK plumbing
commits into main — prod runtime already had them (manual deploy), git now
matches. Verified on pooter.world: /ledger 200 serving 44 claims from the
8 Jul 2026 PMQs (claude-sonnet-4-6 via Agent Hub), zero motive-vocabulary
violations, every claim deep-linked to Hansard; homepage + /proposals healthy.
**why** — Phase A dev gate passed: live extraction on dev produced verbatim,
sourced, verdict-free claims. No libel surface; ship and let the archive
compound.
**where** — GitHub `dev` + `main`; Railway earnest-love + faithful-purpose
(auto-deploys). No env or DB changes — migration 002 NOT yet applied, so
prod serves live-extracted (cache-refreshed 6h) claims until the cron +
DATABASE_URL land. Discovered: faithful-purpose service `radiant-liberation`
auto-builds from `dev` pushes (untracked in project map; audit chip filed).
**rollback** — `git revert` the seven ledger commits on a branch → dev → main;
or point main back to 36b138e is NOT an option (never force push). Page-level
kill: delete web/src/app/ledger + api routes in a revert commit.

## ▲ node 19 · Claim Ledger Phase A — PMQs vertical slice

**when** — 2026-07-10 ~18:20 UTC
**what** — Six commits on `feat/claim-ledger` (off `dev`, NOT yet merged):
`2077a8d` — docs/CLAIM_LEDGER_SPEC.md v0.1 committed as source of truth.
`cd3faa5` — lib/ledger Hansard client: finds "Engagements" sittings, segments
debate text into attributed contributions with hansard.parliament.uk deep
links. `982c43e` — extraction agent + `claimLedgerExtraction` AI task
(premium provider order): verbatim-substring guard (fabricated quotes are
dropped, never repaired) + motive-vocabulary guard (never "lie"). `b479b78` —
golden set hand-labeled from the real 8 Jul 2026 PMQs + 27 unit tests + live
benchmark (RUN_LEDGER_BENCHMARK=1); first run via local Agent Hub / Groq
llama-3.3-70b: 100% recall, 78% precision, invariants clean. `26563ac` —
pooter.ledger_claims migration (002), idempotent /api/cron/ledger-pmqs,
/api/ledger/claims read API; works with or without DATABASE_URL. `70c04cc` —
/ledger page: "This Week's Checkable Claims", sworn style, zero verdicts.
**why** — Phase A per spec: unresolved claims only = immediate content, zero
libel surface. UK first, PMQs slice, Tier 2 backfill is the launch strategy.
**where** — web/src/lib/ledger/*, web/src/lib/db/ledger-claims.ts,
web/migrations/002, web/src/app/ledger + api routes, ai-models.ts (new task),
vitest.config.ts (new, with server-only stub). lib/claim-extract.ts (newsroom
headline normalization) deliberately untouched.
**rollback** — branch not merged; delete `feat/claim-ledger`. Migration 002 is
additive (one table). Known quirk: hub-routed extractions stamp provider
"ollama" (pre-existing ai-provider labeling; background task filed).

## ▲ node 18 · insurgent rebrand + live UK governance + ZK voting plumbing

**when** — 2026-07-10 ~09:15 UTC
**what** — Three commits on `feat/uk-governance` → prod:
`dad1447` — full palette rebrand: black ink / warm newsprint / union red
(#c8102e), Archivo Black headlines, dark theme as punk inversion. Kills the
navy+teal "healthcare" look. `e8cdafc` — Phase 0 of the governance plan:
live UK petitions + bills in /proposals with signature progress bars, stage
labels, durable by-ID permalinks, momentum ranking; fixed the "everything says
ENDED" bug (stale actives with expired endTime now demote; UK civic sources
lead the live tier). `ec57b4c` — Phase 2A plumbing: MembershipRegistry.sol +
PrivateBallot.sol (compile clean, NOT deployed) + circuits/vote/vote.circom —
anonymous member voting scaffold (Semaphore-style, reuses the Groth16 stack).
**why** — the political-party push: pooter as a UK-governance engagement PWA
(stealth mode — party framing not public yet). User chose "insurgent
broadsheet" direction + Phase 0 & 2A-plumbing scope.
**where** — web tokens/layout, web/src/lib/governance.ts + proposals UI,
contracts/src, circuits/vote. PWA manifest colors synced.
**rollback** — revert the three commits individually; contracts/circuit are
inert until a proving setup + deploy exist.

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
