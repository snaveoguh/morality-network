# Bearometer — China supply-chain signal layer

Design note, 2026-10-28. Status: first slice built on `feat/bearometer-supply-chain`.

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
| Wire sweep | aggregator | Google News keyword query (rare earth / gallium / …  + China) | Catches Reuters/Bloomberg pick-ups of MOFCOM notices |

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

## LLM spend

None in this slice. Tagging and direction are regex. This follows the
2026-09-19 credit-drain rules by construction: nothing to meter.

The planned upgrade (stubbed, off by default): classify only items whose
direction came back `neutral` but which hit a group, using the
`editorialExtractor`-class fast model order, gated by
`hasAIProviderForTask()` (respects `AI_DISABLED_PROVIDERS`) and the
`ai-budget` caps, failing closed to the regex result. Results cached by item
id so each headline is classified at most once.

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
