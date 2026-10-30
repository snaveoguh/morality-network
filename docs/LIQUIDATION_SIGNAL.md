# Liquidation-cluster signal: method and backtest

Status (2026-10-30): **informational only. It fails its gate and is not used by the trader.**

## What the signal is

`liquidationSignal()` in `web/src/lib/liquidation-signal.ts` reads a liquidation map and returns:

- the nearest **large** cluster of long liquidations below the price, and of short liquidations above it. "Large" means a window of 2 adjacent buckets holding at least 10% of that side's liquidation notional on the map. For each cluster it gives the price range, the notional, the signed distance to its near edge (% of price) and its share of that side;
- the **imbalance** near the price: (shorts − longs) / (shorts + longs) for liquidations within ±5%.

On `/markets` it is computed from the map shown: real Hyperliquid positions plus the estimate for the open interest not scanned (`hl-positions.ts`). Page loads write one row per coin per hour to `pooter.signals` with `produced_by = 'liquidation-map'` and `direction = 'neutral'`, with the numbers in `source_detail`. The trader cannot see these rows. `getRecentSignals()` leaves this producer out of its query, and the trader also skips any neutral row. Nothing in `web/src/lib/trading/*` was changed.

## Why the backtest uses the estimated map

Hyperliquid's `clearinghouseState` returns positions as they are now. There is no history of real liquidation prices, either in the public API or in the agent-arena backtest (`feat/agent-arena`, GRAPEVINE node 71). That branch was never pushed and is not on GitHub, so it could not be extended. The backtest therefore replays the **estimated** map over Hyperliquid's 1h candles. At each step it uses only the previous 168 candles, and a constant stands in for open interest, which only scales the estimate. The exact signal can be backtested only once its hourly rows in `pooter.signals` cover a few months. Nothing prunes that table: `pruneExpiredSignals()` is never called, and the TTL only hides rows from readers.

## Hypotheses and tests

Trials are spaced one horizon apart, so no two trials share future candles.

1. **Magnet.** Price reaches the nearer large cluster before the farther one. Chance is a mirrored placebo on the same price path: the same two distances, with the near level moved to the other side of the price. The test is a paired sign test, z = (wins − losses) / √(wins + losses).
   The first version compared against the random-walk chance dFar / (dNear + dFar), counted only over trials that reached a level. That "passed" with z = 3.4, but it is biased. Within a fixed horizon the farther level often is not reached at all, which inflates near-first with no real effect. The placebo removes that bias.
2. **Imbalance.** When liquidations near the price are lopsided, price moves towards the heavier side (more shorts above → up). Test: hits against 50%.

Gate (`LIQ_SIGNAL_GATE`), per hypothesis, pooled over coins: at least 300 trials, z ≥ 2, and an edge on a majority of coins.

## Results

Run: `npx jiti ./scripts/backtest-liquidation-signal.ts --horizon <h>`, 2026-10-30. Data: the last 5,000 hourly candles (about 208 days) for BTC, ETH, SOL, HYPE, XRP, ZEC, BNB and DOGE.

| Horizon | Magnet trials | Magnet z | Coins with edge | Imbalance calls | Imbalance z | Coins with edge |
|---|---|---|---|---|---|---|
| 12h | 3,216 | 0.89 | 4/8 | 2,427 | −4.32 | 0/8 |
| 24h | 1,608 | −0.41 | 3/8 | 1,220 | −4.70 | 0/8 |
| 48h | 800 | 0.33 | 4/8 | 616 | −1.69 | 1/8 |

Per coin at 24h:

| Coin | Near first (real / mirror) | Magnet z | Imbalance hits | Imbalance z |
|---|---|---|---|---|
| BTC | 136 / 132 of 201 | 0.44 | 35/80 | −1.12 |
| ETH | 116 / 121 | −0.49 | 48/128 | −2.83 |
| SOL | 120 / 127 | −0.68 | 70/154 | −1.13 |
| HYPE | 133 / 127 | 0.58 | 87/188 | −1.02 |
| XRP | 130 / 135 | −0.51 | 54/142 | −2.85 |
| ZEC | 124 / 104 | 1.73 | 90/183 | −0.22 |
| BNB | 83 / 96 | −1.32 | 74/166 | −1.40 |
| DOGE | 86 / 98 | −1.10 | 70/179 | −2.91 |

## Reading

- **Magnet: no edge.** Estimated clusters are reached first about as often as their mirror image.
- **Imbalance: significant, but the wrong way round.** Price tends to move *away* from the heavier side. This is very likely trend in disguise, not a liquidation effect. The estimate deletes positions the price has already run through, so after a rise the shorts above have gone, the longs below remain, and the imbalance points down while the trend carries on up. The arena already found trend-following profitable. Trading the inverse of this imbalance would be trend-following through a roundabout route. The three horizons reuse the same candles, so they are not independent confirmations.
- **Not tested: the exact map.** Real liquidation prices may behave differently from the estimate. Keep recording the signal rows and rerun this test on real snapshots once there are a few months of them.

## To wire it into trading later

Only if a rerun passes the gate, and only after the trading key rotation (GRAPEVINE node 73) and a separate review. That needs a new producer direction and a change in `lib/trading`, neither of which is in this branch.
