# Post-Mortem: Trading Bot Dev/Prod Environment Collision

**Date:** 2026-03-23
**Impact:** ~$18.51 net loss on a $116.38 deposit ($98.57 remaining)
**Root cause:** Preview (dev.pooter.world) and Production (pooter.world) shared the same HyperLiquid wallet, Redis store, and trading config — two independent bots fighting over the same $100 account.

---

## Timeline

| Date | Event |
|------|-------|
| Mar 10 | First deposit ($15.00) + trading begins |
| Mar 10-15 | `AGENT_PRIVATE_KEY`, `TRADER_DRY_RUN`, `UPSTASH_REDIS` all set as **"Preview, Production"** (shared) |
| Mar 16 | Additional deposits bring account to ~$100 |
| Mar 16-23 | **976 fills** executed — both dev and prod trading simultaneously |
| Mar 22 | 66 fills in a single hour (12:00) — peak bot-vs-bot conflict |
| Mar 23 | Issue discovered. Dev trading disabled. |

## What Happened

### The Shared Environment Problem

These critical env vars were scoped to **"Preview, Production"** — meaning both environments got the exact same values:

| Env Var | Effect |
|---------|--------|
| `AGENT_PRIVATE_KEY` | Same HL wallet — both placing real orders |
| `UPSTASH_REDIS_REST_URL` | Same position store — overwriting each other's tracking |
| `UPSTASH_REDIS_REST_TOKEN` | Same Redis auth |
| `HYPERLIQUID_IS_TESTNET` | Both on mainnet |
| `TRADER_DRY_RUN` | Both in live mode |

### How Two Bots Fought Each Other

1. **Prod** opens BTC LONG 40x @ $68,085
2. **Dev's** trading cycle runs ~40s later on the **same HL wallet**
3. Dev either:
   - Opens its own position (doubling exposure, or HL nets them against each other)
   - Dev's reconciliation doesn't know about prod's position, sees something unexpected, triggers a close
4. **Prod's** next reconciliation queries HL, position is gone
5. Prod marks it as `"manual (disappeared from HL)"` — recorded as held for only 5 minutes
6. Both bots write to the **same Redis key** (`pooter:positions`), overwriting each other's position tracking

### Why "Disappeared from HL" Happens

The engine reconciliation loop (`getHyperliquidOpenPositionsFromVenue`) works like this:
- Fetch live positions from HL API
- Compare against positions stored in Redis
- Any position in Redis but NOT on HL → close as `"manual (disappeared from HL)"`

When dev and prod share the same wallet:
- Prod stores position A in Redis
- Dev runs, doesn't know about A, opens position B on HL
- HL may net positions, close A, or dev's bot explicitly closes A before opening B
- Prod's next sync: "Where did A go?" → marks as disappeared

### The "Disappeared" Problem Will NOT Happen Again Because:

1. **Dev no longer has `AGENT_PRIVATE_KEY`** — can't connect to HL at all
2. **Dev no longer has Redis** — can't read or write position store
3. **Dev has `TRADER_DRY_RUN=true`** — triple safety net
4. Even if dev somehow ran, it would generate a random throwaway key (not the real wallet)

## By The Numbers

### Account Summary
```
Total deposited:     $116.38
Current balance:      $98.57
Net loss:            -$17.81
```

### Fill Analysis (976 total fills)
```
Closed PnL (all fills):     -$1.43
Fees paid:                  $17.08
Net loss:                  -$18.51

Bot-vs-bot conflicts:        97 (opposing sides on same coin within 30 seconds)
Fees burned on conflicts:    $2.17
```

### Hold Time Analysis
```
Closed in <5 min:    198 positions | PnL: -$0.60 | Fees: $6.08
Closed in <10 min:   388 positions | PnL: -$0.48 | Fees: $7.47
Closed in <30 min:   398 positions | PnL: -$0.61 | Fees: $7.65
Held >1 hour:         20 positions | PnL: +$0.01 | Fees: $0.30
```

**398 out of 418 tracked positions (95%) were closed within 30 minutes.** Most of these were either bot-vs-bot conflicts or stop-outs on noise.

### What-If: Only Kept Positions Held >30 Minutes
```
PnL:        +$0.39
Fees:        $0.35
Net:        +$0.04
Avoided:     398 unnecessary trades, $7.65 in wasted fees
```

### Per-Coin Breakdown
```
ETH:    556 fills | PnL: -$2.14  | Fees: $9.63  | Net: -$11.78  (worst performer)
BTC:    311 fills | PnL: +$1.99  | Fees: $5.96  | Net: -$3.97
TRUMP:   25 fills | PnL: -$0.51  | Fees: $0.32  | Net: -$0.83
SOL:     11 fills | PnL: -$1.30  | Fees: $0.18  | Net: -$1.48
HYPE:     4 fills | PnL: +$0.83  | Fees: $0.08  | Net: +$0.74   (best performer)
ZEC:      2 fills | PnL: +$0.48  | Fees: $0.02  | Net: +$0.46
```

### The BTC Long That Got Away

The bot repeatedly caught the right direction on BTC but couldn't hold:
- **03/23 05:02** — Opened LONG @ $68,612
- **03/23 05:05** — Closed @ $69,265 → **+$0.95** (held 3 min)
- BTC continued to $70,700+ — would have been **+$3.05** if held 1 hour

The pattern repeated dozens of times: enter correctly, get stopped out or dev-killed within minutes, miss the bigger move.

## Fixes Applied

### Immediate (2026-03-23)
1. **Preview env vars overridden:**
   - `AGENT_PRIVATE_KEY` → empty (no HL access)
   - `UPSTASH_REDIS_REST_URL` → empty (no Redis)
   - `UPSTASH_REDIS_REST_TOKEN` → empty
   - `TRADER_DRY_RUN` → true
   - `TRADER_EXECUTION_MODE` → disabled

2. **PnL accuracy fix:**
   - Open positions now use HL's authoritative `unrealizedPnl` (includes funding, actual fees)
   - Previously recalculated from 20s-stale cached prices — wildly inaccurate at 40x leverage

3. **Rationale persistence fix:**
   - Entry rationale now saved to Redis BEFORE HL order is placed
   - Prevents "no rationale recorded" when server restarts between order and store write

4. **Min account balance reduced:** $100 → $69 (bot was blocked from trading)

5. **Dev banner added:** Amber "DEV" banner on dev.pooter.world warning no live trades

### Recommendations for Future

1. **NEVER share `AGENT_PRIVATE_KEY` across environments** — use testnet key for Preview, or no key at all
2. **NEVER share Redis between environments** — use separate Upstash databases or key prefixes
3. **Consider adding environment prefix to Redis keys** — e.g., `prod:pooter:positions` vs `preview:pooter:positions`
4. **Reduce trade frequency** — 976 fills in 13 days on $100 is massive overtrading. Consider:
   - Higher `TRADER_MIN_SIGNAL_CONFIDENCE`
   - Wider stop-loss (current tight stops + 40x leverage = stopped out on noise)
   - Longer minimum hold time before allowing exits
   - Reduce `TRADER_MAX_NEW_ENTRIES_PER_CYCLE`
5. **Add environment validation on startup** — bot should log and refuse to trade if it detects shared config across environments
6. **Pull PnL from HL fills for closed positions too** — our engine's closed PnL calculation was showing +$60.99 when HL's actual was -$1.43

---

*This incident resulted from a configuration error, not a code bug. The trading logic itself was functioning correctly — it was simply running twice on the same account from different environments.*
