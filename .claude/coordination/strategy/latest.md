# Strategic Brief
Generated: 2026-03-16T12:00:00Z
Next review: 2026-03-17T00:00:00Z

## Sprint Day 1 — Foundation

### Product Strategy
The core product loop is: Rate morally → Trade on ratings → Profit → Publish proof → Attract users.
Everything we build serves this loop. The moral compass pipeline (already running) feeds
trading signals. Trading P&L becomes marketing content. Marketing drives users who rate
more entities, improving the moral data, improving trading performance. Flywheel.

### Revenue Strategy
Week 1 focus: Get the trading engine live with moral alpha signals.
- The trading infrastructure is complete (engine, scalper, risk management, Hyperliquid client)
- Missing link: moral compass scores → trading signal weight
- Once connected, we can execute moral-aligned trades
- Every trade is logged with moral justification per SOUL.md

Week 2 focus: API monetization.
- APIs already exist (entity lookup, feed, global feed all Done)
- Need: auth middleware, rate limiting, tier enforcement, Stripe integration
- Target: $99/mo Pro tier for traders wanting moral score data

### Growth Strategy
- **Farcaster-first**: Web3-native audience, every user has a wallet. Post moral trading
  results as social proof. Free via Neynar.
- **Bluesky-second**: Broader audience, completely free API. Cross-post adapted content.
- **The karmic grid narrative**: This is unique. No one else is trading on moral ratings.
  The story sells itself if the returns are real.

### Technical Priorities
1. Moral score → trading signal integration (1 session, 1 day)
2. Live trading execution with moral constraints (1 session, 1 day)
3. Marketing bot setup (1 session, 1 day)
4. Indexer stability — parallel track (1 session, ongoing)
5. API auth + tiers (1 session, 2 days)

### Competitive Analysis
No direct competitor rates entities on morality AND trades on that data. Closest:
- ESG scoring services (legacy, slow, expensive, no trading integration)
- On-chain reputation protocols (no trading signal, no cross-entity scoring)
- Prediction markets (Polymarket, Manifold) — no moral dimension
We own this niche.

### Risk Assessment
- **Moral**: Trading on moral scores could be seen as gamifying ethics.
  Mitigation: full transparency, all scores public, SOUL.md constraints.
- **Financial**: Trading losses could undermine the thesis.
  Mitigation: Kelly sizing, circuit breakers, dry-run first week.
- **Technical**: Indexer instability could delay API monetization.
  Mitigation: Trading and marketing are independent tracks.
