# 🍇 GRAPEVINE — pooter.world

The vine grows **up only**. Every change is a **node** added at the top.
Never edit or delete a node below it — the past is immutable; you only add.

To check out or roll back a past change: climb down to its node, run its `rollback`.

Each node carries: **when · what · why · where · rollback**.

---

## ▲ node 40 · backfilled 5 lost closes + widened book to 6×$40

**when** — 2026-07-24
**what** — (a) BACKFILL: ran `/app/backfill.mjs` inside the worker container —
reconstructed the post-revival closed positions from HL fills and inserted 7
rows (the 5 close events split across partial fills) into pooter.trade_decisions,
idempotent (id=`backfill:<coin>:<openMs>`, ON CONFLICT DO NOTHING). Total
realized backfilled **-$5.8418** (matches HL exactly): TAO -4.14/-0.08, BTC
+1.43, ZEC +2.43, ETH -2.77, HYPE -0.84/-1.87. /markets realized P&L now
reflects real activity instead of the stale pre-April +$3.39. (No April→July
gap to fill — the worker was dead then, no trades.) (b) SIZING: set worker env
`TRADER_MAX_OPEN_POSITIONS=6`, `TRADER_MAX_POSITION_USD=40`,
`TRADER_MAX_PORTFOLIO_USD=240` via `railway variables --set` (redeploys the
7ec56f0 fix image + new caps). ~$80 margin at 3x on the ~$154 account. Lets
equities/silver (xyz dex, already in the watchlist + signal fires) into the
book as slots free.
**why** — user: "both good to go let it rip." Backfill so the dashboard tells
the truth; wider book so HIP-3 markets can actually take positions.
**where** — DB write via container; worker env. NOTE: current open exposure
(~$343 notional across 4 positions from the old 4/100/400 sizing) EXCEEDS the
new $240 portfolio cap, so no NEW opens until existing crypto closes below 240
— that first new open is also what verifies the recording fix end-to-end.
**rollback** — env back to 4/100/400 (or 2/150/600 defaults); delete backfill
rows via `DELETE FROM pooter.trade_decisions WHERE id LIKE 'backfill:%'`.

## ▲ node 39 · REAL root cause of the recording gap — BigInt in entry_rationale

**when** — 2026-07-24
**what** — the recording bug was never the close path (node 37/38 fixed that
but it was only half the story). Reconcile (run inside the worker container via
`railway ssh`) showed **0 open rows AND 0 closed rows since 23 Apr** — writes
stopped entirely. Ruled out (with live-DB tests): DB unreachable (reads + a
manual insert both work), schema drift (27 cols correct), wallet mismatch
(single wallet, since_may=0), missing code, indexer-routed writes (it's a
direct `sql` insert; the indexer app being down is separate telemetry). Then
reproduced the actual throw in-container: a **BigInt inside `entry_rationale`**
→ `sql.json` → `TypeError: Do not know how to serialize a BigInt`, thrown
inside `createTradeDecision`, swallowed by the caller's try/catch → no row,
every open. (A red herring en route: NaN in the integer `leverage` col also
throws 22P02, but the code can't actually produce NaN leverage — numberFromEnv
is guarded — so that wasn't it.) FIX (`web/src/lib/db/trade-decisions.ts`):
`createTradeDecision` now sanitizes at the DB boundary — `dbInt`/`dbNum` coerce
non-finite→null (leverage rounded), and `dbJson` serializes BigInt→string and
non-finite→null, never throwing. Verified the fixed path inserts cleanly
against the live DB (BigInt stored as string).
**why** — user asked to actually run the reconcile; it exposed that the fix so
far was insufficient (open write, not close, was the failure point).
**where** — trade-decisions.ts (createTradeDecision). Committed on `dev`; to be
deployed to the worker. NOT backfilled: the ~months of missing rows +
the 5 recent closes (reconcile lists them) still need a one-time backfill.
NOTE the exact BigInt field isn't whaleNetExposure (typed number) — it's
another rationale/deliberation value; the fix covers any BigInt regardless.
**rollback** — revert the commit; the insert reverts to throwing on BigInt.

## ▲ node 38 · close-recording fix DEPLOYED to prod worker (surgical patch over uncommitted HIP-3)

**when** — 2026-07-24 ~19:32 UTC
**what** — shipped node-37's trader close-recording + fee fix to the live
`pooter-agent-worker` (pooter-indexer/production, service dc970b4f) via
`railway up` from the clone `~/Downloads/morality-network-latest/web`.
DISCOVERY: that clone's "uncommitted patch" is not just the .js boot fix — it
is the ENTIRE HIP-3 builder-dex impl (config/hyperliquid/types.ts, 397 lines)
living ONLY as uncommitted edits on a stale main. A checkout/merge would have
wiped live prod code. So shipped my fix as a SURGICAL `git apply` of a 5-file
delta (trade-decisions/engine/scout/scalper/metrics-v2 + reconcile script),
disjoint from the 6 HIP-3/boot files → they stayed untouched. Verified boot-tsc
(`worker:build`) with HIP-3 + delta together before deploy; removed macOS
node_modules pre-upload.
**why** — make the close-recording fix actually run (node 37 was dev-only /
not live; the worker has NO GitHub integration, deploys manually).
**verified** — fresh boot: `worker:build` tsc clean, `Starting Container`,
`[Worker] starting {tasks:[trader,swarm]}`, `[signals] using postgres: 5
signals`. Zero downtime (old image traded through the build).
**where** — clone web/ subdir; branch `dev` @ 01e040b is the committed source.
TECH DEBT: the HIP-3 code must be committed to the repo — right now a stray
`git checkout` in the Downloads clone erases prod HIP-3.
**rollback** — redeploy the prior image from the Railway dashboard, or
`git apply -R` the delta in the clone and `railway up` again.

## ▲ node 37 · trader close-recording fix + real fee rate (dev, ledger-free branch)

**when** — 2026-07-24
**what** — three commits on `dev` (6fc3ca2, 8834b47, 6f9ee9f). (a) FIX: since
the pooter:v5 rearm, closes executed on HL stopped recording in
pooter.trade_decisions — `mirrorCloseToPg` (engine) + scalper/scout mirrors
were fire-and-forget and `UPDATE … WHERE cloid=X AND closed_at IS NULL`
matched nothing, threw nothing, logged nothing, never fell back. Now: close
writers return rows-affected; shared `recordTradeDecisionClose()` (cloid →
wallet+symbol+openedAt fallback); engine AWAITS the mirror; all three agents
LOG LOUDLY on a 0-row close. (b) FIX: /markets fee display 0.00035→0.0009
round-trip (observed 0.045%/side on real fills); engine hurdle 0.0007 flagged
as low. (c) reconcile-hl-fills.mjs (read-only HL↔PG diff).
**why** — user: /markets showed no closes since April while HL had 5 real
closes 7/21–7/23 (net −$5.84); dashboard realized stale at +$3.39 (pre-April
only). Proven from public HL fills. Kelly reads the Redis book (not PG) so its
sizing was NOT starved — the bug blinded the dashboard, not the brain.
**where** — web/src/lib/db/trade-decisions.ts, lib/trading/{engine,scout,
scalper}.ts, app/api/trading/metrics-v2/route.ts, web/scripts/reconcile-hl-fills.mjs.
Split OFF the ledger clearance-gate work (parked on branch
`feat/claim-ledger-clearance`, needs migrations 006/007 before it can ship) so
the trader fixes deploy without it. NOT backfilled: the 5 historical closes —
run reconcile script + a one-time close of orphaned rows.
**rollback** — revert the three commits; all additive, no migration.

## ▲ node 36 · 4 position slots + news→market mapping for equities & silver

**when** — 2026-07-20 ~night local
**what** — (a) env on worker: `TRADER_MAX_OPEN_POSITIONS=4`,
`TRADER_MAX_POSITION_USD=100`, `TRADER_MAX_PORTFOLIO_USD=400` — more
slots, smaller size, ~$133 total margin on the $153 account.
(b) `f286882`: news extraction emits engine-exact xyz symbols
(TSLA/NVDA/AAPL/MSTR/COIN/SILVER); killed dead GOLD/SILVER symbol
outputs in signals.ts aggregation (gold→PAXG, silver→xyz:SILVER — silver
news had been proxied to gold since before HIP-3); equity aliases added;
specific-equity patterns before the SPX catch-all. Port also upgraded
the worker's older swarm-signals (macro relay patterns + contradiction
threshold 3→5). Deploy 7a57e740 SUCCESS.
**verified live** — minutes after deploy: `composite xyz:SILVER: long
conf=0.90` (engine evaluating real silver on a 14-year-high tape) and a
third position opened at the NEW sizing: BTC long $100 @ 3x. Book: TAO
short $150, DOGE short $135, BTC long $100 — 3/4 slots, $385 deployed.
**where** — web/src/lib/trading/{signals,swarm-signals}.ts + worker env.
Wart: market-signals OI fetch doesn't know builder-dex symbols
("No OI data for xyz:SILVER") — graceful, OI signal just absent there.
**rollback** — env back to 2/150/300; revert `f286882` and redeploy
worker from the clone's web/ subdir.

## ▲ node 35 · indexer revived after 10 days down — telemetry bus flowing again

**when** — 2026-07-20 ~late evening local
**what** — deployed the `indexer/` Ponder app (repo root) to the
`pooter-indexer / pooter-indexer` service via `railway up` from the
**indexer/ subdir** — first SUCCESS since Jul 10 (deploy 4665b58b).
Root cause of the Jul-10 deaths: builds ran against the WRONG directory
(web deps compiling on Node 18 → npm ci exit 1). Correct context =
indexer/ alone; env (DATABASE_URL, PONDER_RPC_URL_*, contract addrs,
INDEXER_WORKER_SECRET) was intact on the service the whole time.
**why** — user asked why /bots Pipeline Health showed everything HUNG.
The pipeline was fine (trades placed same day); the telemetry courier was
dead. One dead service = five symptoms: health board blind, dev
.pooter.world metrics hard-error, worker trader-state persist 404,
worker swarm/latest 404, editorial-archive remote reads failing.
**verified** — /api/v1/health 200; worker logs flipped to "trader
snapshot persisted { openPositions: 2 }"; dev.pooter.world metrics
serves the WORKER's real state (dryRun:false); console event bus
flowing (emerging-event 32, trader-cycle-complete 4, swarm-snapshot 2
per 15m). Follow-up commit `77d4d49`: spectator sanitizers now also
redact readiness.account (the worker-state path exposed the trader
address there).
**warts left** — Ponder historical sync needs an archive-capable RPC
(publicnode rejects old eth_getLogs; ~37m backfill est. when healthy);
composite/mapping health boxes stay amber until a position slot frees
(evaluation skipped at 2/2 open). Anonymous /bots shows UNKNOWN — the
console API is operator-gated by design.
**rollback** — none needed; to take the indexer down again, remove the
service's active deployment. Deploy procedure: `railway link -p
pooter-indexer -s pooter-indexer` from the repo's indexer/ dir, then
`railway up`.

## ▲ node 34 · /pipe rendering error — first public open positions crashed the page

**when** — 2026-07-20 ~evening local
**what** — `7a58c41` + `a53c657` (dev+main): three defensive fixes on /pipe.
Root cause: `PositionEntry` was written for raw HL assetPosition rows
(`coin`/`szi`/`leverage.value`) but /api/trading/metrics serves engine
report rows (`{position:{...}, unrealizedPnlUsd}`). Until node 30 the
public payload NEVER contained open rows, so the component never rendered
— the moment the rearmed trader opened TAO+DOGE (node 32), every /pipe
visitor crashed on `position.leverage.value` of undefined. Also hardened:
metrics parsing no longer accepts `{error}` payloads as reports
(`payload.performance ?? payload` trap), `totals` reads optional-chained,
undefined feed sources filtered before NewsGlobe's toLowerCase.
**why** — user reported RENDERING ERROR on /pipe. Verified fixed on prod:
Active Positions renders "DOGE SHORT 3X / TAO SHORT 3X" anonymously.
**where** — web/src/app/pipe/page.tsx, web/src/components/pipe/NewsGlobe.tsx.
Known remaining cosmetic lie: header still says "DRY RUN / Account $0.00"
because the web process reads its own inert trader config + throwaway
wallet (documented pre-existing issue, not a crash).
**rollback** — revert both commits; the crash returns whenever open
positions exist publicly.

## ▲ node 33 · HIP-3 builder-dex support — equities, gold, silver tradeable

**when** — 2026-07-20 ~evening local
**what** — `42b532b` (dev+main): the trading engine can now address HL's
builder-deployed perp dexs (HIP-3). Markets named `dex:TICKER` (lowercase
case-significant prefix), asset ids `100000 + dexIndex*10000 + i`, per-dex
meta merged into the market map, case-preserving candles/fills,
isolated-margin support, per-dex clearinghouse merged into positions +
account value, and automatic USDC `sendAsset` into the builder dex's own
collateral ledger before entries. Env: `HYPERLIQUID_BUILDER_DEXES=xyz`;
watchlist now 17 markets incl. xyz:TSLA, xyz:NVDA, xyz:AAPL, xyz:GOLD,
xyz:SILVER. Ported to the worker clone and deployed (14ad4e44, SUCCESS).
Smoke test `web/scripts/smoke-builder-dex.mjs` verified live: 264 markets,
TSLA marketId 110001, real prices, technical signal computes on equities
(TSLA below red cloud at ship time).
**why** — user: "def wana do this" — wants shares + silver. Main dex has
neither; the xyz builder dex has 87 markets including both.
**where** — web/src/lib/trading/{hyperliquid,config,types}.ts. Worker
deployed from the clone's web/ subdir (node 31 procedure). NOTE: live
composite evaluation of the new markets starts when a position slot frees
(2/2 full at deploy). The one path only a real trade proves is the
sendAsset margin hop — schema-verified, logs loudly.
**rollback** — unset `HYPERLIQUID_BUILDER_DEXES` (prefixed watchlist
entries then resolve to no market and are skipped); or revert `42b532b`
and redeploy.

## ▲ node 32 · strategy widened — both directions, 12-market universe, first trade

**when** — 2026-07-20 ~evening local
**what** — env-only on `pooter-agent-worker`: `TRADER_DIRECTION_MODE=both`
(user: "sophisticated strategy"; shorts re-enabled under the node-31 tight
gates — 0.75 confidence, 2-signal agreement, ichimoku-forward), and explicit
`HYPERLIQUID_WATCH_MARKETS=BTC,ETH,SOL,ZEC,PAXG,SPX,HYPE,XRP,DOGE,LINK,AVAX,TAO`
— adds gold (PAXG) and the S&P 500 index perp (SPX) alongside crypto.
NOTE: `TRADER_WATCH_MARKETS` is dead config the engine ignores; the real
var is `HYPERLIQUID_WATCH_MARKETS`. Individual equities (TSLA/NVDA/…) and
silver exist only on HL's `xyz` builder dex (87 markets) which the deployed
engine cannot address — future feature.
**why** — user asked for a sophisticated multi-asset strategy ("shares,
silver, btc, zcash"). Archived-book data corrected the "last 4 were shorts
and won" recollection (last 4 were longs, 3 won) but trend-aligned
both-ways beats a blanket direction ban under the new gates.
**where** — Railway env, worker redeployed (deploy 22f6b59d). Minutes after
binding: first live trade of the new era — SHORT TAO $150 notional 3x,
composite 1.00, cold quarter-Kelly, entry $194.85. Verified on HL
clearinghouseState. Also verified: /markets spectator mode live on prod for
anonymous users — Closed Positions (1078) render from Postgres via
metrics-v2, wallet fields redacted.
**rollback** — `TRADER_DIRECTION_MODE=long-only` to re-restrict; kill
switch stays `TRADER_DRY_RUN=true` (needs the web/-subdir deploy path,
node 31).

## ▲ node 31 · trader rearmed — long-only probation, fresh book, ichimoku-forward

**when** — 2026-07-20 ~afternoon local
**what** — env-only change on `pooter-indexer / pooter-agent-worker` (no code
deploy; stale-clone `technical.ts` already identical to repo — Ichimoku was
already implemented at 20% of the technical vote). Set:
`TRADER_DIRECTION_MODE=long-only`,
`TRADER_POSITION_STORE_PATH=/tmp/pooter-trader-v5.json` (fresh Kelly book —
old 94-trade history archived untouched at Redis `pooter:v4`),
`SIGNAL_WEIGHT_TECHNICAL=0.40` (ichimoku-forward tilt, weights self-normalize),
caps: position $150 / portfolio $300 / 2 open / 1 entry-per-cycle / 5x max
leverage, gates: confidence 0.75 (was 0.6), agreement 2 (was 1), breaker 3
losses (was 10). Prod web `morality-network` got the matching
`TRADER_POSITION_STORE_PATH=v5` so /markets displays the new book.
Worker redeployed (same image) so env bound.
**why** — Kelly was correctly refusing to size on the old negative-edge book
(94 closed, ~41% win, last close 2026-06-09) — 0.7-weighted history kept
rawKelly < 0 forever. Fresh book → cold-start Kelly (winProb = composite
confidence, quarter-Kelly, ~$150 notional at 3x on the $154 account).
Account was flat on HL (verified) so the store move orphaned nothing.
**where** — Railway env only, both services. Trader wallet
`0x38501DEB0984E651fE5275359904C76e6F7f764d`, account value $153.95 at arm
time. Known wart: worker's trader-state persist to indexer 404s
("Application not found", non-fatal) — same dead INDEXER_BACKEND_URL as
dev.pooter.world's metrics route.
**rollback** — kill switch: `railway variables --set 'TRADER_DRY_RUN=true'`
linked to pooter-agent-worker. Old book: set both
`TRADER_POSITION_STORE_PATH` back to `/tmp/pooter-trader-v4.json`.

## ▲ node 30 · trading terminal spectator mode

**when** — 2026-07-20 ~afternoon local
**what** — `67338d4` (dev): /markets terminal open + closed position tables
now render for everyone. `sanitizePerformance` in
`web/src/app/api/trading/metrics/route.ts` no longer strips `open` rows or
cripples `closed` rows — full position telemetry is public. Still gated:
account address, funding address, readiness balances (operator/holder
only), and chat + trade execution (unchanged, MO-holder/operator).
**why** — user wants the trading terminal viewable to everyone. Position
rows contain no account identifiers (tx hashes are onchain anyway), so
spectator mode is safe; the wallet-identifying fields stay redacted.
**where** — `web/src/app/api/trading/metrics/route.ts`,
`web/src/components/markets/AgentMarketDashboard.tsx`. Via dev gate →
dev.pooter.world, then main.
**rollback** — revert `67338d4`; the old sanitizer stripped open/closed
detail for non-holders.

## ▲ node 29 · /ledger nav — card grid instead of buried text links

**when** — 2026-07-11 ~18:35 local
**what** — `f006abe`: replaced the three small underlined text links under
the /ledger intro (added in node 28) with a three-card grid — This Week's
Claims / Manifesto Commitments / Who Funds the Parties — one click each
from the hub page.
**why** — user asked "how do I get to that via clicking?" — the text links
were too easy to miss. Rather than invent a new top-nav dropdown, matched
the pattern the codebase already settled on: Header.tsx has comments
("CoopDropdown removed — Co-op is now a full page") documenting that a
hover dropdown was tried for /coop and dropped in favor of a visible card
grid on the hub page itself. Same fix here, no new precedent.
**where** — web/src/app/ledger/page.tsx only. Top nav unchanged (still one
"Ledger" link). Verified in the browser preview, light + dark mode.
**rollback** — revert the commit; the three text links still work as a
fallback pattern if reverted.

## ▲ node 28 · money map v1 — member interests + Who Funds the Parties

**when** — 2026-07-11 ~12:15–17:20 local (~18:15–23:20 UTC)
**what** — Two more parallel agents (this time Sonnet, orchestrated from the
main Fable session) on the funding scaffold from node 27. `90a3c7f` member
interests: every /ledger/member/[id] page gains a "Register of Members'
Financial Interests" section, keyed by the SAME canonical Parliament id the
page already uses — zero cross-registry name matching. Smoke-tested live
against Starmer (4514): gift entries with a stated donor (Arsenal tickets)
become edges, employment payments with no stated counterparty correctly
stay excluded. `cac3387` /ledger/funding ("Who Funds the Parties"):
trailing-12-month per-party donation totals + recent donations straight
from the EC register, every row linking its ECRef document page (1993
donations in-window live-verified: e.g. JCB->Conservatives £5,000,
Scottish Parliament->Labour £56,216). Deliberately NO party-to-MP linkage
— that needs inference the spec bans without a verified join. Linked from
/ledger. Integration verified on prod against a member WITH claims
(Cleverly, 4366 — first pick, Starmer 4514, has zero ledger claims so
notFound() correctly fired; not a bug, wrong test subject).
**where** — web/src/lib/funding/{member-profile,party-donations}.ts,
member page, new /ledger/funding page, /ledger subnav.
**rollback** — revert both commits; no schema/env changes.

## ▲ node 27 · parallel agent batch — manual verdicts, money-map scaffold, LibDem, solicitor PDF

**when** — 2026-07-11 ~11:15–12:00 local (~17:15–18:00 UTC)
**what** — Four agents run concurrently with strict file-ownership
partitions, integrated + shipped as `da6540c..96b0386` (one dev→main pass;
146 tests, only the known pre-existing agent-bus failure). (1) `96b0386`
human-proposed resolutions: operators propose verdicts on ANY claim from
/ledger/review with a validated document chain; same queue, same DB gate —
unlocks policy-outcome/spending topics the agent can't resolve; the
realistic path to the first n≥20 score. (2) `3e453d3` funding money-map
scaffold: EC donations search API + Register of Members' Financial
Interests API both live-verified unauthenticated; typed fetchers in
web/src/lib/funding/; both registries supply Companies House numbers as
join keys → no-inferred-edges holds structurally. Probe log + v1 model in
docs/FUNDING_MAP_NOTES.md. Companies House needs a free key (enrichment).
(3) `da6540c` LibDem 2024 manifesto found on party domain (117pp) —
registry complete at four. (4) Solicitor handoff delivered as 6-page PDF
(~/Downloads/pooter-ledger-solicitor-review.pdf): framework, safeguards,
s.2/s.3/s.4 mapping, the three real specimens (Darling negatives marked
HELD), five questions incl. the deceased-subject precedent question.
**where** — web lib/app + docs; no env or DB changes.
**rollback** — revert the three commits; the PDF is an artifact.

## ▲ node 26 · verdict supply unblocked + front-page strip; anchor key armed

**when** — 2026-07-11 ~08:00–10:20 local (~14:00–16:20 UTC)
**what** — (1) LEDGER_ANCHOR_PRIVATE_KEY set on prod via CLI with output
suppressed (key never in transcript; verified by deriving the address from
the Railway env — matches operator 0xd634…2933). First onchain anchor fires
at the next 06:10 UTC cron. (2) `c980a4f` — overdue predictions resolve:
predictive claims past their stated due date (or >5y old with none) are now
resolvable; previously the 2010 Budget promises could NEVER resolve. ONS
fetcher reads quarterly/annual observations (GDP is quarterly); evidence
carries annual history from 2009; registry + GDP QoQ (IHYQ/QNA). KAC3
earnings series failed verification — left out. (3) `ecc2a1d` — front-page
Claim Ledger strip (live counts, one query). (4) Resolve pass over the
widened backlog: 41 scanned (was 6), 2 proposed — BOTH 'false' against
Darling's 2010 Budget forecasts (inflation, debt path) vs ONS annual
outturns. These are the FIRST NEGATIVE verdicts: HELD in queue pending the
media-solicitor response per spec §Legal guardrails. Note: Darling d. 2023;
defamation of the deceased isn't actionable in England — lowest-risk
precedent available. (5) Holders email drafted to
~/Downloads/pooter-holders-email-claim-ledger.md.
**where** — Railway env, web lib (resolve/ons/db), LedgerStrip + page.tsx.
**rollback** — revert the two commits; unset the env vars to stop anchoring.

## ▲ node 25 · manifesto backfill live + reviewer-curated evidence (OBR lane)

**when** — 2026-07-11 ~07:30–07:45 local (~13:30–13:45 UTC)
**what** — Two commits `91932d2..284d4c1` through dev → main. (1) Manifesto
backfill: unpdf PDF ingest (page-tracked, claims deep-link to #page=N),
passages run through the unchanged extraction/validation pipeline, claims
attribute to the PARTY (member_id null), commitments extract as predictive
with the parliament as horizon. Registry: Labour/Conservative/Green 2024
(LibDem URL rotted — re-point later). Daily 17:30 UTC cron, one per run,
self-exhausting. Browse: /ledger/manifestos + per-manifesto pages. First
ingest: 81 claims from Labour 2024 ("40,000 more appointments each week",
GB Energy, etc.), persisted + verified rendering. (2) Reviewer-curated
evidence on approval: the review API accepts validated extra evidence
(new 'obr' kind; https + bounded excerpt) APPENDED to the agent's chain —
the spec's human-curated lane for OBR evaluation reports, judgments,
inquiries. No hand-entered data tables anywhere. Cost note: AI budgets cap
direct spend at $0.20/day total; hub routing carries the rest; manifesto
one-off ≈ $2-5. Real cost levers are dev env (unpaused today, was
cost-paused in node 17) + radiant-liberation (audit chip filed).
**where** — web lib/app (sources/manifestos.ts, cron, pages, review API),
crons.yml, package.json (+unpdf).
**rollback** — revert both commits; claims rows are data (delete by
debate_ext_id LIKE 'manifesto-%' if ever needed).

## ▲ node 24 · LedgerAnchor deployed to Base + pw icons + first verdict public

**when** — 2026-07-11 ~07:05–07:20 local (~13:05–13:20 UTC)
**what** — (1) Hugo published the first verdict from /ledger/review
(Cleverly voting-record claim → Resolved true, reviewer stamped). It now
displays on /ledger and /ledger/member/4366 with the division-2401 evidence
chain. (2) LedgerAnchor deployed to Base mainnet:
`0x1A55c83fb85D5d5Ab9415b016a47A56C0a54B99d` (non-upgradeable — immutability
IS the feature; operator-only, holds no funds). Fresh operator key
`0xd634…2933` generated to `~/.pooter-ledger-anchor.key` (chmod 600, never
displayed) and funded 0.002 ETH from the deployer (~2 years of daily txs);
deploy + funding via forge scripts reading env, no keys on argv. Anchor cron
now sends unanchored roots onchain (oldest first, tx_hash written back) —
ACTIVATES when Hugo pastes the key into Railway as
LEDGER_ANCHOR_PRIVATE_KEY (LEDGER_ANCHOR_ADDRESS already set). (3) pw mark
extended to favicon.ico + 192/512 PWA icons (same UnifrakturCook render;
mascot SVG untouched). (4) Verdict template is with Hugo to send to a media
solicitor.
**where** — Base mainnet, contracts/script + broadcast records, web icons,
anchor cron, prod Railway env, CLAUDE.md key-contracts list.
**rollback** — contract is immutable; to abandon it just stop anchoring
(delete the env vars). Icons: previous PNGs in git history.

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
