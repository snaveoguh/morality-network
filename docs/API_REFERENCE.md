# API Reference

Complete reference for all live API endpoints. Last updated: 2026-03-24.

## Base URL

- **Local:** `http://localhost:3000/api`
- **Production:** `https://pooter.world/api`
- **Dev:** `https://dev.pooter.world/api`

---

## Feed & Content

### `GET /api/feed`
Returns merged RSS feed items from 100+ sources. Server-side cached (15 min TTL).

Query params: `category`, `tag`

Response: `{ items: FeedItem[], total: number }`

### `GET /api/feed/sources`
Returns configured RSS source list.

Response: `{ sources: FeedSource[] }`

### `GET /api/search`
Full-text search across feed items and editorials.

### `GET /api/stumble`
Returns random content for discovery. Query: `mode=single` for one item.

### `GET /api/appendix`
Static reference data. ISR: 1 day.

---

## Editorial & Newsroom

### `GET /api/daily-edition`
Returns the current daily newspaper edition.

### `GET /api/cron/daily-edition` (cron)
Generates daily newspaper edition. Auth: `CRON_SECRET`. Schedule: daily 5:30 AM UTC. maxDuration: 55s.

### `GET /api/cron/daily-illustration` (cron)
Generates DALL-E 3 cover art for daily edition. Auth: `CRON_SECRET`. Schedule: daily 5:45 AM UTC.

### `GET /api/newsroom` (cron)
Generates Pooter Originals for top stories. Auth: `CRON_SECRET`. Schedule: 3x daily (6 AM, 2 PM, 10 PM UTC). maxDuration: 55s.

### `POST /api/newsroom`
Manual newsroom trigger. Auth: `CRON_SECRET`. Body: `{ forceRegenerate?, maxStories?, minStories? }`

### `GET /api/editorial/pregenerate` (cron)
Pre-generates editorials for top feed items. Auth: `CRON_SECRET`. Schedule: daily 5 AM UTC.

### `POST /api/editorial/generate-one`
Generate editorial for a single article. Auth: `CRON_SECRET`.

### `POST /api/editorial/edit`
Edit an existing editorial. Auth: `GOD_MODE_SECRET`.

### `POST /api/editorial/mark-onchain`
Mark an editorial as minted onchain. Auth: `GOD_MODE_SECRET`.

### `POST /api/editorial/backfill-illustrations`
Backfill DALL-E illustrations for editorials missing them. Auth: `CRON_SECRET`.

### `GET /api/editorial/discover`
Discover feed items that don't yet have editorials. maxDuration: 30s.

---

## Editions (NFT)

### `GET /api/edition/:tokenId`
Returns edition metadata for a given token ID.

### `GET /api/edition/:tokenId/image`
Returns edition cover image.

### `GET /api/edition/:tokenId/illustration`
Returns edition DALL-E illustration.

---

## Governance

### `GET /api/governance`
Returns governance proposals from all configured providers (Nouns, Lil Nouns, UK Parliament, EU, etc.).

Query params: `filter` (`live`, `controversial`, or omitted for all)

Response: `{ proposals: Proposal[], total: number, timestamp: number }`

### `GET /api/governance/:id`
Returns one governance proposal by ID with fallback logic.

### `GET /api/v1/governance/live`
Normalized governance stream for product/partner consumers. Supports extensive filtering.

Query params: `scope`, `source`, `sourceKind`, `status`, `tag`, `cursor`, `limit` (max 500)

Response: `{ data: GovernanceItem[], meta: { totalFiltered, nextCursor, generatedAt } }`

---

## AI & Scoring

### `POST /api/ai/score`
AI scoring for entities. In-memory cache (30 min TTL). Rate limited: 20 req/min per IP.

Body: `{ identifier, entityType: "URL"|"DOMAIN"|"ADDRESS"|"CONTRACT", content? }`

Response: `{ identifier, entityType, score, compositeAIScore, timestamp }`

### `GET /api/moral-compass/crawl` (cron)
Crawls ethics/philosophy sources. Auth: `CRON_SECRET`. Schedule: daily 3 AM UTC.

### `GET /api/moral-compass/status`
Returns moral compass crawl status.

### `GET /api/moral-commentary/generate` (cron)
Generates AI moral commentary. Auth: `CRON_SECRET`. Schedule: daily 4 AM UTC.

---

## Sentiment

### `GET /api/sentiment`
Returns current AI-generated market sentiment scores. ISR: 5 min.

### `GET /api/sentiment/history`
Returns historical sentiment data. ISR: 5 min.

---

## Trading

### `GET /api/trading/signals`
Returns aggregated trading signals from editorial analysis.

### `GET /api/trading/signals/live`
Live streaming trading signals.

### `POST /api/trading/execute`
Execute a trading signal cycle. Auth required.

### `GET /api/trading/positions`
Returns current open positions.

### `POST /api/trading/close-position`
Close a specific position. Auth required.

### `GET /api/trading/metrics`
Returns trading performance metrics.

### `GET /api/trading/performance`
Returns detailed performance analytics.

### `GET /api/trading/journal`
Returns trade journal entries.

### `GET /api/trading/learning`
Returns trading learning/adaptation data.

### `GET /api/trading/candles`
Returns OHLCV candle data for charting.

### `GET /api/trading/indicators`
Returns technical indicator values.

### `GET /api/trading/readiness`
Returns trading system readiness status.

### `GET /api/trading/risk-advisor`
Returns AI risk assessment for current positions.

### `POST /api/trading/transfer-to-perp`
Transfer funds to perpetual exchange. Auth required.

---

## Markets

### `GET /api/markets`
Returns crypto market prices (BTC, ETH, SOL, PEPE, DOGE, etc.) via CoinGecko + DexScreener. ISR: 30s.

---

## Predictions

### `GET /api/predictions/ops`
Returns prediction market operations snapshot. Auth: operator. ISR: 1 hour.

---

## Agents

### `GET /api/agents`
Returns registered agent list and status.

### `POST /api/agents/coordinator`
Agent bus coordinator endpoint. Dispatches tasks to agents.

### `GET /api/agents/scanner`
Returns launch scanner results.

### `GET /api/agents/scanner/:token`
Returns scanner data for a specific token.

### `POST /api/agents/swarm`
Triggers research swarm execution.

### `POST /api/agents/bus`
Agent bus messaging endpoint.

### `POST /api/agents/bus/relay`
Relay messages between agent bridges.

### `GET /api/agents/events/stream`
SSE stream of agent events.

### `GET /api/agents/console`
Returns agent console output/logs.

### `POST /api/agents/memory/learn`
Submit learning data to agent memory.

### `POST /api/agents/memory/self-learn`
Agent self-learning trigger.

### `GET /api/agents/memory/stats`
Returns agent memory statistics.

---

## Analysts

### `GET /api/analysts/interpretations`
Returns analyst interpretations of current events.

### `GET /api/analysts/reputation`
Returns analyst reputation scores.

---

## Terminal

### `POST /api/terminal/chat`
LLM-powered chat endpoint. Streams responses via SSE. Rate limited: 15 req/min per IP. maxDuration: 30s.

### `GET /api/terminal/risk`
Returns risk assessment data for terminal display.

### `GET /api/terminal/subscription/status`
Returns terminal subscription/access status (MO token gated).

---

## Discussion

### `GET /api/discuss/stream`
SSE stream of discussion room messages.

---

## Deliberation

### `GET /api/deliberation/schema`
Returns the canonical deliberation graph schema (entity -> claim -> interpretation -> evidence -> outcome).

---

## Evidence

### `POST /api/evidence/verify`
Verify evidence claims against source material.

---

## Marketplaces

### `GET /api/pepe/:asset`
Returns Rare Pepe card details.

### `GET /api/pepe/img/:asset`
Returns Rare Pepe card image.

### `GET /api/pepe/listings`
Returns active Rare Pepe marketplace listings via Emblem Vault.

### `GET /api/nouns/:nounId`
Returns Noun NFT details.

### `GET /api/nouns/listings`
Returns active Nouns marketplace listings via Seaport.

---

## Music

### `GET /api/music/discover`
Returns music discovery results.

---

## Protocol

### `GET /api/protocol-wire`
Returns protocol wire data/announcements.

---

## Auth (SIWE)

### `GET /api/auth/nonce`
Returns a fresh SIWE nonce.

### `POST /api/auth/verify`
Verifies SIWE message + signature. Body: `{ message: SiweMessage, signature: string }`

Response: `{ address: string, chainId: number }`

### `GET /api/auth/session`
Returns current session state.

---

## Health

### `GET /api/health/sources`
Returns health status of RSS feed sources. ISR: 5 min.

---

## Indexer Endpoints

Separate service (Railway). Base URL: `INDEXER_BACKEND_URL`

### `GET /api/v1/health`
Health check. Response: `{ ok: boolean, timestamp: number }`

### `GET /api/v1/entities/:entityHash`
Returns indexed entity profile with aggregate stats and recent activity.

### `GET /api/v1/entities/:entityHash/feed`
Per-entity activity feed. Query: `limit`, `cursor`, `actionTypes`

### `GET /api/v1/feed/global`
Global activity feed. Query: `limit`, `cursor`, `from`, `to`, `actionTypes`, `actor`, `entityType`

---

## ISR Revalidation Summary

| Route | Interval |
|-------|----------|
| Homepage (`/`) | 15 min |
| Signals, Proposals, Predictions, Pepe, Discuss, Nouns | 1 hour |
| Archive | 5 min |
| Article detail | 1 hour |
| Sentiment | 5 min |
| Markets API | 30s |
| Appendix | 1 day |
| OG images | 1 day |

---

## Authentication

- **Cron endpoints:** Require `Authorization: Bearer <CRON_SECRET>` header (sent by the active scheduler or internal worker caller)
- **Editorial edit:** Requires `Authorization: Bearer <GOD_MODE_SECRET>`
- **Operator endpoints:** Require wallet signature from `OPERATOR_ADDRESSES`
- **Terminal:** Rate limited per IP, full access gated by MO token balance
- **User auth:** SIWE (Sign-In With Ethereum)
