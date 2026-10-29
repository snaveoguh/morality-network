# Bearometer — China supply-chain signal layer

Design note, 2026-10-28. Status: first slice built on `feat/bearometer-supply-chain` (ingest, tagging, record, panel). Not merged or deployed.

## What exists today

`/signals` (`web/src/app/signals/page.tsx`) renders `SignalDashboard` from
`getAggregatedMarketSignals()` in `web/src/lib/trading/signals.ts`. That
function scores tickers from the editorial archive's `marketImpact` records
(direction × confidence × significance × 48h recency decay × horizon weight,
with a contradiction penalty), optionally replaced by the Agent Hub
"newsdesk" synthesis. The same function feeds the trading engine
(`lib/trading/engine.ts`), so it is load-bearing.

This work leaves that pipeline alone. "Bearometer" is the user-facing name
for the page; the route stays `/signals` and `/bearometer` redirects to it.

## Idea (from Matt)

China dominates refining of rare earths and several minor metals. Chinese
government notices (export controls, licence regimes, quota changes) and
Chinese press coverage of price moves and shortages reach component makers
(magnets, transistors, RF chips, battery anodes) before they reach Western
earnings calls. Watch those sources, group the news by supply chain, and turn
each group into an indicator: is supply tightening or easing, and which
listed companies are positioned on each side.

## Sources

All are fetched through the existing `fetchFeed()` in `lib/rss.ts`, so they
inherit retries, timeouts, `getSourceBias()` labels and error reporting.

| Source | Kind | How fetched | Note |
|---|---|---|---|
| MOFCOM (Ministry of Commerce) | government | Google News `site:mofcom.gov.cn` | Direct site timed out from here; no RSS |
| GACC (General Administration of Customs) | government | Google News `site:customs.gov.cn` | Low volume (≈5 items / 60 days) |
| Xinhua | state media | Google News site + materials keywords | |
| Global Times | state media | Google News site + materials keywords | Raw RSS works but is untopical |
| China Daily | state media | Google News site + materials keywords | Old RSS paths 404 |
| SCMP | independent (Alibaba-owned) | Google News site + materials keywords | Direct RSS 301s |
| Caixin Global | independent | Google News site + keywords | Direct RSS 403s; low volume |
| Wire sweeps (×6) | aggregator | One Google News keyword query per group, 7 days | Catches Reuters/Bloomberg pick-ups of MOFCOM notices. A single OR query returned only rare-earth stories, so it is split per group |

Every source gets a `BIAS_DATABASE` entry (state funding is labelled, as on
the main feed). Government notices get a higher weight because they are the
primary event; press items are secondary.

Not in this slice: Chinese-language pages (mofcom.gov.cn 公告, 海关总署
statistics), monthly GACC export volumes per HS code, and metal spot prices
(SMM, Asian Metal and Fastmarkets are paywalled).

## Taxonomy — component groups

Each group is a chain from **material → component → end use**, with
keyword patterns for the material and the component side, and two curated
ticker lists:

- **ex-China supply** — producers or refiners outside China whose position
  tends to strengthen when Chinese supply tightens.
- **exposed** — buyers whose input costs or availability suffer when it
  tightens.

| Group | Materials | Components | End uses |
|---|---|---|---|
| Rare earths → magnets | NdPr, dysprosium, terbium, samarium | NdFeB permanent magnets | EV motors, wind turbines, defence |
| Gallium / germanium → chips | gallium, germanium | GaN/GaAs RF chips, power semis, IR optics, fibre | 5G, radar, data centres |
| Graphite → battery anodes | natural & synthetic graphite | anodes | EV and grid batteries |
| Antimony / tungsten → defence | antimony, tungsten | munitions, hard metals, flame retardants | defence, tooling |
| Lithium & battery chemicals | lithium, LFP cathode tech | cathodes, cells | EVs, storage |
| Legacy chips & discretes | wafers, discrete transistors (Nexperia) | MOSFETs, diodes, transistors | autos, industrial, PC builds |

The ticker lists live in one file (`web/src/lib/bearometer/supply-chain-taxonomy.ts`)
so they can be edited without touching the scoring code. They are a
starting point for review, not a vetted list.

## Indicator logic (deterministic, no LLM)

For each item:

1. **Group tags** — regex match on title + description against each group's
   material and component patterns. An item can hit several groups.
2. **Direction** — `tightening` (+1): export control, licence requirement,
   ban, quota cut, suspension, shortage, "harder to get", price rise.
   `easing` (−1): lift/suspend controls, resume exports, licences granted,
   exemption, truce. Neither → `neutral` (0, still counted as activity).
   When both fire, easing wins only if it is the explicit subject ("suspend
   export controls"), otherwise tightening.
3. **Weight** — source weight (government 1.5, state media 1.0, independent
   1.0, aggregator 0.8) × recency decay (72h half-life; supply chains move
   slower than the 48h the trading signals use). Items older than 30 days
   are dropped.

Per group: `pressure = tanh(Σ direction × weight / 2)` in −1…+1, and
`activity = Σ weight`. Labels:

- `TIGHTENING` — pressure ≥ 0.25
- `EASING` — pressure ≤ −0.25
- `MIXED` — activity but neither threshold
- `QUIET` — no items

On `TIGHTENING` the panel says the signal leans toward the ex-China supply
list and against the exposed list; on `EASING` the reverse. That is the
whole "who gains or loses" rule — it is shown as a direction on a watchlist,
with the supporting headlines, never as a trade instruction.

A request to ease ("Japan asks the US to help ease rare-earth curbs") does
not count as easing; it falls through to the tightening patterns.

## LLM spend

Off by default. Tagging and direction are regex; with the flag unset nothing
here calls a model, so there is nothing to meter.

`lib/bearometer/supply-chain-llm.ts` is built and opt-in
(`BEAROMETER_LLM_CLASSIFY=true`). It classifies only items that hit a group
but came back `neutral`, one word out (`maxTokens: 4`), using the
`editorialExtractor` fast model order. It is gated by `hasAIProviderForTask()`
(respects `AI_DISABLED_PROVIDERS`) and goes through `generateTextForTask`, which
enforces the fail-closed `ai-budget` caps. At most 8 calls per snapshot; the
first error stops further calls for that snapshot. Answers are cached by item id
in-process. Any failure keeps the regex result. Items it relabels show
"AI-labelled" in the panel and `direction_by = 'llm'` in the record.

## Signal record (for scoring later)

Migration `015_bearometer_supply_chain.sql` adds two tables:

- `pooter.bearometer_supply_items`: one row per tagged headline, keyed by a
  hash of its link, with `first_seen_at` (when we knew it, which is the time a
  backtest should use), source, kind, groups, direction and `direction_by`.
- `pooter.bearometer_supply_indicators`: one row per group per snapshot
  (`recorded_at`, label, pressure, activity, item count) with copies of both
  ticker lists, so later taxonomy edits do not rewrite history.

Written on each fresh snapshot, at most once every 20 minutes per process.
Writes are skipped without `DATABASE_URL` and log a warning on error; they never
break the page. These tables are deliberately not `pooter.signals`, which the
trader reads. Nothing reads them yet: scoring against price moves is the next
step.

## Caching

- In-process cache of the computed snapshot, 30 min TTL.
- `/signals` keeps ISR `revalidate = 3600`.
- `/api/bearometer/supply-chain` sends `s-maxage=1800, stale-while-revalidate`.

## UI placement

On `/signals`, retitled **Bearometer**:

1. Header and a one-line note that this is signals and data, not advice.
2. **Supply chain — China** panel (new): one card per group with the label,
   a −1…+1 pressure bar, item count, ex-China and exposed tickers, and the
   three most recent tagged headlines with source and bias/state label.
3. The existing **Market signals** dashboard, unchanged.

The panel is a separate async server component under `Suspense`, so a slow
feed cannot hold up the existing dashboard.

## Not wired to trading

The supply-chain indicator does not feed `getAggregatedMarketSignals()` or
the trader. Wiring it in should be a separate, reviewed change.

## Global layer (2026-10-29)

The panel on `/signals` is now **Supply chain — global**, grouped by region.
The China layer above is unchanged and is shown inside East Asia. Code:
`web/src/lib/bearometer/global-supply-*.ts`, taxonomy in
`global-supply-taxonomy.ts` (edit indicators there; scoring does not change).

### Scoring

- Data indicator: `pressure = tanh(polarity × change / scale)`, −1…+1.
  `change` is a percentage against the indicator's own baseline (3-month
  mean for daily prices, same 14 days a year earlier for transits, a year
  earlier for FAO, 13 weeks earlier for the SPR). For OECD confidence it is
  points from the long-run mean of 100. `polarity` is +1 when a rise means
  strain (prices, freight, Cape rerouting) and −1 when a rise means relief
  (transits, reserve stocks, confidence). `scale` is the size of a normal swing.
- News indicator: same formula as the China layer: Σ ±weight × 72h-half-life
  decay, divided by 2, then tanh. Regex direction (`classifyDisruption`):
  disrupting, easing or neutral. A call to reopen does not count as a reopening.
- Labels: |pressure| ≥ 0.25 → Strained / Easing, otherwise Steady. Data older
  than `maxAgeDays` → Out of date. Out-of-date data is shown but not scored.
- Region: the unweighted mean of its scored readings.

### Asset read-across

Each indicator lists Bearometer engine symbols (BTC, ETH, SOL, PAXG/gold,
DXY, SPX, OIL, NVDA, AAPL, TSLA), the direction each has tended to move when
the indicator shows strain, and how much weight the link can bear:
documented, plausible or speculative. None of these links is backtested,
and the panel says so.

### Sources (checked live 2026-10-29)

| Source | Used for | Note |
|---|---|---|
| IMF PortWatch `Daily_Chokepoints_Data` (ArcGIS) | transits at 9 chokepoints | Only statistics queries work; about half its server instances reject queries, so each call retries up to 5 times |
| Yahoo Finance chart API | BDRY, BWET, BZ=F, TTF=F, NG=F, HG=F, ZW=F, LIT | Unofficial but keyless |
| OECD SDMX `DSD_STES@DF_CLI` BCICP | manufacturing confidence: EA20, DEU, USA, MEX, CHN, JPN, KOR, IND | Free stand-in for PMIs. India last updated Feb 2026; Vietnam not covered |
| UN FAO Food Price Index CSV | world food prices | Monthly |
| US EIA WCSSTUS1 history page | SPR stocks | HTML table, parsed |
| Google News RSS, one query per region | news sweeps | Through `fetchFeed()` |

Checked and left out: FRED (404s and timeouts from our hosts), GIE AGSI EU gas
storage (needs an API key), Drewry WCI container rates (429), DBnomics IMF
commodity prices (last value June 2025), NY Fed GSCPI (legacy .xls only), S&P
Global and ISM PMIs (not free to republish).

### Record

Migration `016_bearometer_global_supply.sql` adds
`pooter.bearometer_global_readings` (one row per indicator per snapshot) and
`pooter.bearometer_global_items` (headlines, first seen). Not applied yet.
