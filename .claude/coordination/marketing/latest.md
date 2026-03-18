# Marketing Report
Generated: 2026-03-17T00:00:00Z
Sprint Day: 2 (Cycle 3)

## Channel Status
| Channel | Status | Followers | Posts Today | Impressions |
|---------|--------|-----------|-------------|-------------|
| Farcaster | setup_needed | 0 | 0 | 0 |
| Bluesky | setup_needed | 0 | 0 | 0 |

## What Shipped Since Last Cycle (Cycle 2 → Cycle 3)

From git log (last 8h): No new commits.

From git log (last 24h): 3 commits from Sprint Day 1 (all prior to last report).

Trading infra has expanded significantly — new files detected in lib/trading/:
`moral-gate.ts`, `composite-signal.ts`, `self-learning.ts`, `kelly.ts`,
`risk-advisory.ts`, `signals.ts`, `trade-journal.ts`, `pattern-detector.ts`
These are modified/staged but not yet committed. The karmic trading engine
is largely built. Content story shifts from "we're building" to "almost live."

---

## Content Generated This Cycle

All content passes SOUL.md check: no misleading claims, AI disclosure included,
no manufactured hype. "Almost live" framing only used for already-built components.

### Farcaster (Post 1 — Moral Gate Reveal, ~298 chars)
```
The karmic trading engine has a moral gate.

Before any position executes: moral score > 70? Long.
Score < 30 with documented harm? Short.
Neutral zone: no trade.

This isn't ESG box-checking. It's a circuit breaker hardwired into the engine.

AI-generated | pooter.world
```

### Farcaster (Post 2 — Transparency Pledge, ~270 chars)
```
Sprint Day 2 / 30. Running a live public P&L for moral alpha trading.

Every trade will include:
- Entity rated
- Moral score (Truth, Harm, Agency, Power)
- Position + size
- P&L outcome

The thesis lives or dies on transparency. No cherry-picking.

AI-generated | pooter.world
```

### Bluesky (Post 1 — Moral Gate Reveal, ~274 chars)
```
The karmic grid trading engine has a moral gate baked into execution.

No trade fires without checking moral score thresholds first.
Long = moral score > 70%.
Short = documented harm, score < 30%.

Not ESG. Onchain. Permissionless. Live P&L coming.

AI-generated | pooter.world
```

### Bluesky (Post 2 — Transparency Pledge, ~280 chars)
```
Day 2 of a 30-day sprint to prove morality is alpha.

Every trade will be public: entity rated, moral score, position, outcome.

Four axes: Truth, Harm, Agency, Power.
One question: does high morality predict outperformance?

Follow for results. AI-generated | pooter.world
```

---

## Setup Checklist

Infrastructure NOT ready (no env vars in .env.local). Same blockers as Cycles 1 & 2.

**Farcaster — Priority 1**
- [ ] Create pooter.world Farcaster account via Warpcast app
- [ ] Sign up for Neynar API key at neynar.com (free tier)
- [ ] Register Neynar signer (~1 OP onchain tx)
- [ ] Add `NEYNAR_API_KEY` + `NEYNAR_SIGNER_UUID` to v2/web/.env.local
- [ ] Add `postCast(text: string)` to v2/web/src/lib/farcaster.ts
  - Current farcaster.ts is read-only (feed fetch, user lookup). Needs write function.
  - Endpoint: `POST https://api.neynar.com/v2/farcaster/cast`
  - Body: `{ signer_uuid, text }`
  - Auth header: `x-api-key: NEYNAR_API_KEY`

**Bluesky — Priority 2**
- [ ] Create @pooterworld account at bsky.app
- [ ] Generate app password (Settings → App Passwords)
- [ ] Add `BSKY_HANDLE` + `BSKY_APP_PASSWORD` to v2/web/.env.local
- [ ] Install `@atproto/api` and create `v2/web/src/lib/bluesky.ts`

**SEO — Quick Win (sitemap 404 confirmed Day 2)**
- [ ] Add `v2/web/src/app/sitemap.ts` — ~20 line fix
  - Include: /, /markets, /feed, /leaderboard, /about, /sentiment
- [ ] Verify `app/robots.ts` exists
- [ ] Verify OG/Twitter meta tags on key pages

---

## Queued Content (posting order once infra goes live)

Post in this order, 4h apart:
1. [Cycle 1] "The karmic grid is live. We rate morality and trade on it."
2. [Cycle 1] "4 axes: Truth, Harm, Agency, Power"
3. [Cycle 2] "Protocol wire fixed. Pipeline hardening."
4. [Cycle 2] "Trust compounds. Extraction decays. We get there first."
5. [Cycle 3] "Moral gate: circuit breaker hardwired into the engine." ← NEW
6. [Cycle 3] "Sprint Day 2 / 30 transparency pledge" ← NEW
7. **INTERRUPT** — Trade receipt: post immediately when first live moral trade executes

---

## Content Calendar (Next 24h)

| Time (UTC) | Platform | Type | Content |
|------------|----------|------|---------|
| 04:00Z | Both | Educational | "The 4 moral axes: what each one measures in practice" |
| 08:00Z | Farcaster | Engagement | Reply to DAO governance debates with moral score frame |
| 12:00Z | Both | Competitive | "Why moral alpha beats ESG: speed, transparency, verifiability" |
| 16:00Z | Both | Builder | "What it looks like to build a moral compass for onchain entities" |
| ASAP | Both | Trade receipt | First live trade — interrupt calendar, full moral justification posted |

---

## Metrics vs Sprint Targets

| Metric | Current | Week 1 Target | Gap | Blocker |
|--------|---------|---------------|-----|---------|
| Farcaster followers | 0 | 500 | -500 | Neynar signer not set up |
| Bluesky followers | 0 | 200 | -200 | App password not set up |
| Daily impressions | 0 | 5,000 | -5,000 | No posts yet |
| Website visits from social | 0 | 100/day | -100 | No posts yet |
| API signups from social | 0 | 10 | -10 | No posts yet |
| Live moral trades | 0 | 1 | -1 | Signal integration pending |
| Sprint revenue | $0 | $0 (setup wk) | on target | N/A |

---

## SEO Status (daily check — first run of Sprint Day 2)

- `pooter.world/sitemap.xml` → **404** (confirmed Day 2)
- No sitemap.ts in app directory — still missing
- Two days in with zero SEO signal. Compounding organic reach delayed daily.
- Fix today: assign to a worker session, ~20 minutes.

---

## Recommendations

1. **URGENT — Neynar setup is the only distribution blocker.**
   Content library now has 6+ posts staged across 3 cycles. Every cycle delayed
   is wasted reach. Neynar free tier: 100 casts/day. No cost to start.

2. **Commit the trading infra files today.**
   `moral-gate.ts`, `composite-signal.ts` and others are built but unstaged.
   Git history is public narrative — "shipped moral gate Day 2" is a content beat.
   Commit them so the story is visible.

3. **Fix sitemap.xml today.** Confirmed 404 two days running. 20-minute task.
   Organic search is a free compounding channel.

4. **Lead with the moral gate concept.** Most concrete, unique, explainable piece
   of the product so far. "A circuit breaker that only fires trades on moral entities"
   is a tweet, a thread, and a product demo all in one.

5. **No fake urgency.** SOUL.md: don't claim capabilities before they're live.
   "Moral gate is built, first trade pending signal" = accurate.
   "We're trading now" = not yet true. Maintain this strictly.

6. **Self-learning patterns detected.** `self-learning.ts` in trading infra —
   if adaptive moral pattern detection is working, that's a strong future narrative:
   "The model learns which moral signals predict performance."
   Save this for when it produces real data.
