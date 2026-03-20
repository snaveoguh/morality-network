# Morality.Network v2 — Product Design Reference (PDR)

## Source of Truth Document
**Last Updated:** 2026-03-19
**Status:** Active Development — Trading + Newsdesk Live on Dev

---

## 1. VISION

A permissionless, censorship-resistant news feed and discussion platform where:
- Anyone can read and discuss news without paywalls or gatekeeping
- All conversations happen onchain (Base L2) making them uncensorable
- Value flows directly: readers tip content creators, commenters, and site owners
- Every entity (domain, ETH address, smart contract, URL) has a universal reputation score
- Ethereum wallet = your identity. No emails, no passwords, no middlemen.
- **AI editorials** synthesize world events into opinionated analysis, with structured market impact
- **Trading signals** flow from editorial analysis into autonomous position management on Hyperliquid

**The Big Unlock:** Attaching real economic value (0x addresses on Base) to all content, enabling direct value exchange between consumers and creators — bypassing all intermediaries. The editorial and trading engines close the loop: news → analysis → signals → positions → P&L.

---

## 2. SYSTEM ARCHITECTURE

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Next.js 16)                               │
│                                                                                  │
│   pooter.world / dev.pooter.world — Vercel                                      │
│                                                                                  │
│   ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│   │ Feed     │ │ Editorial │ │ Signals  │ │ Bots     │ │ Entity   │            │
│   │ - RSS    │ │ Archive   │ │ Dashboard│ │ Console  │ │ Profile  │            │
│   │ - Items  │ │ - AI gen  │ │ - Ticker │ │ - Trades │ │ - Rating │            │
│   │ - Tips   │ │ - Market  │ │ - Scores │ │ - P&L    │ │ - Tips   │            │
│   │ - Rate   │ │   Impact  │ │ - Action │ │ - Status │ │ - Score  │            │
│   └──────────┘ └───────────┘ └──────────┘ └──────────┘ └──────────┘            │
│                                                                                  │
│   Auth: SIWE via wagmi v2 + viem + RainbowKit                                  │
└───────────┬────────────────────────┬──────────────────────┬──────────────────────┘
            │                        │                      │
            ▼                        ▼                      ▼
┌───────────────────────┐  ┌──────────────────────┐  ┌────────────────────────────┐
│ POOTER INDEXER        │  │ AGENT HUB            │  │ TRADING ENGINE             │
│ (Railway)             │  │ (Railway)            │  │ (Vercel cron)              │
│                       │  │                      │  │                            │
│ - Ponder v0.16        │  │ Hono + Groq API      │  │ - Signal aggregation       │
│ - PostgreSQL          │  │                      │  │ - Newsdesk fetch           │
│ - Editorial archive   │  │ ┌──────────────────┐ │  │ - Kelly criterion          │
│ - Market impact data  │  │ │ /v1/generate     │ │  │ - Moral gate               │
│ - Entity indexing     │  │ │ /v1/chat         │ │  │ - Circuit breaker          │
│                       │  │ │ /v1/newsdesk/*   │ │  │ - Hyperliquid perps        │
│                       │  │ └──────────────────┘ │  │ - Position lifecycle       │
│                       │  │                      │  │                            │
│                       │  │ Newsdesk Agent:      │  │ Exits:                     │
│                       │  │ - Polls indexer      │  │ - Stop-loss / take-profit  │
│                       │  │ - LLM synthesis      │  │ - Trailing stop            │
│                       │  │ - Signal store       │  │ - Max hold time (4h)       │
│                       │  │                      │  │ - Signal reversal          │
└───────────┬───────────┘  └──────────┬───────────┘  └──────────────┬─────────────┘
            │                         │                              │
            ▼                         ▼                              ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                              EXTERNAL SERVICES                                   │
│                                                                                  │
│   Groq (Qwen3-32B, Llama 3.3 70B)   Hyperliquid L1         Base L2             │
│   Together.ai (fallback)              - Perp trading         - Tipping           │
│   DexScreener API                     - 10x default lev     - Ratings            │
│   Neynar (Farcaster)                  - Cross-margin         - Comments          │
│   Last.fm API                                                                    │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. TECH STACK

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js 16 (App Router) | SSR, RSC, API routes, ISR caching |
| Styling | Tailwind CSS | Fast iteration, newspaper aesthetic |
| Wallet | wagmi v2 + viem + RainbowKit | Best Base L2 wallet UX |
| Auth | SIWE (Sign-In With Ethereum) | Permissionless identity |
| Blockchain | Base L2 (Ethereum) | Cheap txns (~$0.001) |
| Trading | Hyperliquid L1 | Perp DEX, onchain order book |
| Contracts | Solidity 0.8.24 + Foundry | 10 contracts (5 Morality + 2 Pooter + 3 governance/market) |
| Indexer | Ponder v0.16 + PostgreSQL | Event indexing + editorial archive |
| LLM Hub | Hono + Groq API (agent-hub) | Centralized LLM routing, $0/day |
| AI Models | Qwen3-32B (premium), Llama 3.3 70B (fast) | Free tier on Groq |
| Hosting | Vercel (web) + Railway (services) | Zero-config deploys |

---

## 4. EDITORIAL ENGINE

The editorial engine generates AI-powered news analysis from RSS feeds. Each editorial includes structured market impact analysis that feeds the trading signal pipeline.

### Generation Pipeline

```
RSS Feeds (12+ sources)
    │
    ▼
Feed Aggregation (lib/rss.ts)
    │
    ▼
Claim Extraction (lib/claim-extract.ts)
    │  - Extracts verifiable claims from articles
    │  - Identifies key entities and assertions
    ▼
Editorial Generation (lib/claude-editorial.ts)
    │  - AI-generated opinion piece on the claim
    │  - Bias analysis (political lean, confidence)
    │  - Sentiment scoring
    ▼
Market Impact Analysis (lib/article.ts → MarketImpactAnalysis)
    │  - Affected markets (ticker, asset, direction, confidence)
    │  - Significance score (0-100)
    │  - Time horizon (minutes → months)
    │  - Headline summary
    ▼
Editorial Archive (lib/editorial-archive.ts)
    │  - Persisted in Ponder indexer (PostgreSQL)
    │  - Queryable by date, significance, market
    ▼
Signal Pipeline
```

### Market Impact Structure

```typescript
interface MarketImpactAnalysis {
  headline: string;
  significance: number;              // 0-100
  affectedMarkets: Array<{
    asset: string;                    // "Bitcoin", "Crude Oil", etc.
    ticker: string | null;            // "BTC", "CL", etc.
    direction: MarketImpactDirection; // bullish | bearish | neutral | volatile
    confidence: number;               // 0-1
    rationale: string;
    timeHorizon: MarketImpactTimeHorizon; // minutes | hours | days | weeks | months
  }>;
}
```

### Bias & Sentiment

Every editorial is analyzed for:
- **Political bias**: left/center-left/center/center-right/right + confidence
- **Sentiment**: -1 to +1 continuous scale
- **Topic taxonomy**: 20+ categories (geopolitics, crypto, energy, etc.)
- **Evidence quality**: source attribution, verifiability

---

## 5. AGENT HUB — Centralized LLM Service

Replaces all direct Claude/Anthropic API calls across the platform. Runs on Railway.

**Repo:** `/Users/hugo/agent-hub/` → [github.com/snaveoguh/agent-hub](https://github.com/snaveoguh/agent-hub)
**Production URL:** `https://heartfelt-flow-production-d872.up.railway.app`
**Railway project:** `heartfelt-flow` (3a9e55d2-af6b-4e3f-8ddc-45a67916a8b7)

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Status, provider availability, 24h usage stats |
| POST | `/v1/generate` | Single-turn (editorial, scoring, extraction) |
| POST | `/v1/chat` | Multi-turn with tool calling + SSE streaming |
| GET | `/v1/newsdesk/signals` | Current synthesized trading signals |
| GET | `/v1/newsdesk/status` | Newsdesk operational status |
| GET | `/v1/newsdesk/history` | Last N syntheses (default 5, max 24) |

### Architecture

- **Provider fallback:** Groq → Together.ai
- **Task-based routing:** premium tasks (Qwen3-32B), fast tasks (Llama 3.3 70B on Together)
- **Auth:** Bearer token via `AGENT_HUB_SECRET`
- **Telemetry:** In-memory request count, tokens, latency per provider

### Task IDs

| Task | Model Tier | Use |
|------|-----------|-----|
| `editorial` | Premium | AI editorial generation |
| `scoring` | Fast | Content quality scoring |
| `extraction` | Fast | Entity/claim extraction |
| `chat` | Premium | Terminal chat |
| `newsdeskSynthesis` | Premium (Qwen3-32B) | Newsdesk signal synthesis |

---

## 6. NEWSDESK AGENT

Background polling module inside agent-hub that synthesizes editorial market-impact data into actionable trading signals via LLM.

### How It Works

```
Pooter Indexer (PostgreSQL)
    │  editorial-archive with MarketImpactAnalysis
    │
    ▼  polls every 10 minutes
Newsdesk Poller (agent-hub)
    │  - Fetches last 50 editorials with market impact
    │  - Tracks lastSeenHash — skips LLM if no new data
    │  - ~70 LLM calls/day (~455K tokens, fits Groq free tier)
    │
    ▼
Synthesizer (Qwen3-32B via Groq)
    │  - Groups editorials by asset (BTC, ETH, GOLD, OIL, DXY, SPX, etc.)
    │  - Ticker aliasing: CL/BRN/WTI → OIL, XBT → BTC, GC → GOLD, etc.
    │  - Fuzzy pattern matching for asset descriptions
    │  - Considers: direction consensus, contradiction, time decay, significance
    │  - Temperature 0.3 for structured JSON output
    │
    ▼
NewsdeskSignal[] (AggregatedMarketSignal-compatible superset)
    │  + narrative (1-2 sentence synthesis)
    │  + suggestedAction (enter-long | enter-short | hold | exit)
    │  + synthesisConfidence (0-1)
    │
    ▼  served via /v1/newsdesk/signals
Trading Engine + Signals Page
```

### Files (agent-hub)

| File | Purpose |
|------|---------|
| `src/newsdesk/types.ts` | TypeScript interfaces |
| `src/newsdesk/store.ts` | In-memory signal store (current + 24 history) |
| `src/newsdesk/poller.ts` | Background `setInterval` fetch loop |
| `src/newsdesk/synthesizer.ts` | LLM prompt, JSON parsing, signal mapping |
| `src/newsdesk/routes.ts` | Hono sub-router (3 endpoints) |
| `src/newsdesk/index.ts` | Boot function + exports |

### JSON Extraction

Qwen3-32B emits `<think>...</think>` reasoning blocks (sometimes unclosed). The synthesizer extracts JSON by finding the first `{` and last `}` — handles any prefix/suffix garbage. System prompt includes `/no_think` directive.

---

## 7. TRADING ENGINE

Autonomous trading bot that converts editorial-derived signals into leveraged perpetual positions on Hyperliquid.

### Pipeline

```
Newsdesk Signals (agent-hub) ──► fetchNewsdeskSignals()
        │                              │
        │  fallback if unavailable     │
        ▼                              ▼
Raw Signal Aggregation          Enriched Signals
(editorial-archive direct)      (narrative + action + confidence)
        │                              │
        └──────────┬───────────────────┘
                   ▼
        Signal Filtering (minAbsScore: 0.2)
                   │
                   ▼
        Moral Gate (SOUL.md ethics check)
                   │
                   ▼
        Kelly Criterion (position sizing)
                   │  - Win rate from trade journal
                   │  - defaultLeverage: 10x (used when Kelly ≤ 1x)
                   ▼
        Hyperliquid Order Execution
                   │  - Cross-margin
                   │  - Taker fee: 0.035% per side
                   ▼
        Position Monitoring (10-min cron cycle)
```

### Signal Aggregation

Signals from editorials are aggregated per-ticker with:
- **Recency weighting**: 48h exponential decay
- **Significance weighting**: higher significance = more weight
- **Confidence scaling**: editorial confidence multiplier
- **Time horizon weights**: weeks/months > days > hours > minutes
- **Contradiction dampening**: opposing signals reduce net score

### Exit Conditions

| Exit Type | Trigger | Added |
|-----------|---------|-------|
| Stop-loss | Position PnL < -stopLossPct (default 5%) | Original |
| Take-profit | Position PnL > +takeProfitPct (default 10%) | Original |
| Trailing stop | Price drops trailingStopPct from high-water mark | Original |
| Max hold time | Position age > maxHoldMs (default 4h) | 2026-03-19 |
| Signal reversal | Newsdesk direction flips (contradiction ≤ 0.5) | 2026-03-19 |

### Risk Management

- **Circuit breaker**: 3 consecutive losses → 1h pause (exits still evaluated)
- **Max open positions**: configurable (default 5)
- **Max entries per cycle**: configurable (default 2)
- **Kelly criterion**: sizes positions based on historical win rate + avg win/loss
- **Moral gate**: SOUL.md ethics filter — blocks trades on certain instruments

### Key Files (web/src/lib/trading/)

| File | Purpose |
|------|---------|
| `engine.ts` | Core `TraderEngine` class — cycle management, entry/exit logic |
| `signals.ts` | Signal aggregation + newsdesk fetch with fallback |
| `hyperliquid.ts` | HL API: orders, positions, markets, account value |
| `kelly.ts` | Kelly criterion position sizing + consecutive loss tracking |
| `moral-gate.ts` | Ethics filter (SOUL.md compliance) |
| `config.ts` | All config from env vars with sensible defaults |
| `position-store.ts` | Redis-backed position persistence |
| `trade-journal.ts` | PnL calculation, win/loss history |
| `composite-signal.ts` | Multi-factor signal composition |
| `scanner-client.ts` | Token scanner for spot venues |
| `market.ts` | DexScreener price queries |
| `self-learning.ts` | Post-trade analysis for parameter tuning |
| `types.ts` | All TypeScript interfaces |

### Current Account State (as of 2026-03-19)

- **Venue**: Hyperliquid L1 (perps)
- **Balance**: ~$37 USDC
- **Default leverage**: 10x
- **Total trades**: 81
- **Win rate**: 40.7%

---

## 8. SIGNALS PAGE (/signals)

Displays aggregated trading signals from the newsdesk + editorial pipeline.

### Features

1. **Overall Market Narrative Banner** — LLM-synthesized 2-3 sentence overview of market mood (when newsdesk is active)
2. **Per-Ticker Signal Cards** with:
   - Direction arrow (▲ bullish / ▼ bearish)
   - Score bar (conviction strength, 0-5 scale)
   - Action badge: ENTER LONG / ENTER SHORT / HOLD / EXIT
   - Contradiction indicator (⚡ X% conflict when sources disagree)
   - Bullish/bearish weight breakdown
   - Supporting claims (top 3 editorial excerpts)
   - LLM narrative (1-2 sentence synthesis per asset)
   - Synthesis confidence percentage
   - Observation count + source article count
3. **Methodology Box** — explains the scoring formula
4. **Graceful fallback** — if newsdesk is unavailable, renders with raw aggregation (no narrative/action fields)

### Data Flow

```
/signals page (ISR, 60s revalidation)
    │
    ├─► getAggregatedMarketSignals()
    │       │
    │       ├─► fetchNewsdeskSignals() (agent-hub, 10s timeout)
    │       │       └─ returns NewsdeskEnrichedSignal[] if available
    │       │
    │       └─► Raw aggregation fallback (editorial-archive direct)
    │               └─ returns AggregatedMarketSignal[]
    │
    └─► getLastNewsdeskResponse()
            └─ returns narrative metadata for banner
```

---

## 9. AGENT SYSTEM

Multi-agent architecture with shared memory, event bus, and moral compass.

### Core Infrastructure (lib/agents/core/)

| Module | Purpose |
|--------|---------|
| `bus.ts` | Inter-agent event bus (pub/sub) |
| `memory.ts` | Shared agent memory store |
| `soul.ts` | SOUL.md personality + ethics enforcement |
| `moral-compass.ts` | Ethical decision framework |
| `knowledge.ts` | Knowledge base for agent reasoning |
| `registry.ts` | Agent registration and discovery |
| `self-learn.ts` | Post-action learning + parameter adaptation |
| `bridge-signature.ts` | Cross-chain signature verification |
| `human-prompt-meta.ts` | Human interaction context tracking |

### Active Agents

| Agent | Location | Purpose |
|-------|----------|---------|
| Trader | `lib/agents/trader/` | Trading engine lifecycle management |
| Scanner | `lib/agents/scanner/` | Token discovery + analysis |
| Scalper | `lib/agents/scalper/` | Short-timeframe opportunistic trades |
| Newsroom | `lib/agents/newsroom/` | Editorial generation coordination |
| Coordinator | `lib/agents/coordinator/` | Agent orchestration |
| Swarm | `lib/agents/swarm/` | Multi-agent collaboration |
| NounIRL | `lib/agents/nounirl.ts` | Nouns auction settlement (noun.wtf) |

---

## 10. ONCHAIN CONTRACTS (Base L2)

10 contracts (Solidity 0.8.24, Foundry, UUPS upgradeable proxies):

| Contract | Purpose | Security |
|----------|---------|----------|
| `MoralityRegistry.sol` | Universal entity registration (URL, DOMAIN, ADDRESS, CONTRACT) | UUPS + Ownable |
| `MoralityRatings.sol` | 1-5 star onchain ratings per entity | UUPS + Ownable |
| `MoralityComments.sol` | Threaded onchain comments with up/downvotes | UUPS + Ownable |
| `MoralityTipping.sol` | Direct ETH tipping + escrow for unclaimed entities | UUPS + Pausable + ReentrancyGuard |
| `MoralityLeaderboard.sol` | Reputation rankings with AI oracle integration | UUPS + Ownable |
| `MoralityPredictionMarket.sol` | Binary prediction markets on DAO proposals | UUPS + Pausable + ReentrancyGuard |
| `MoralityAgentVault.sol` | Shared vault for AI agent strategies (ERC-4626 style) | UUPS + Pausable + inflation-safe |
| `MoralityProposalVoting.sol` | Signal voting with Noun holder gas refunds | UUPS + Pausable |
| `PooterEditions.sol` | Daily edition NFTs (ERC-721) | UUPS + Ownable |
| `PooterAuctions.sol` | 24hr auctions for edition minting | Ownable + ReentrancyGuard |

### Entity System

Everything is an "entity" with a keccak256 hash:
- `https://nytimes.com/article/123` → URL entity
- `nytimes.com` → DOMAIN entity
- `0xd8dA...96045` → ADDRESS entity
- `0x8335...02913` (USDC on Base) → CONTRACT entity

### Scoring Formula

```
totalScore = (onchainRatingAvg × 0.4) + (aiScore × 0.3) + (tipVolume × 0.2) + (engagementScore × 0.1)
```

---

## 11. ADDITIONAL FEATURES

### Editorial Archive & Daily Edition
- AI editorials stored in Ponder indexer (PostgreSQL)
- Illustration generation for editorials (API routes)
- Daily edition compilation (`/api/daily-edition`)
- Claim extraction + evidence verification pipeline

### Bias & Sentiment Analysis
- Political bias detection (left ↔ right spectrum)
- Real-time sentiment aggregation from RSS feeds
- Event corpus analysis (topic-shaped sentiment snapshots)
- Bias digest generation

### Music Discovery
- Last.fm integration for music recommendations
- Discovery feed with taste profiling
- Music player component

### Terminal (/terminal)
- Claude-powered chat interface (via agent-hub)
- Subscription-gated features
- Risk advisory integration

### Markets & Pepe
- Market overview pages
- Pepe meme asset tracking

### Governance
- Protocol governance proposals
- Deliberation schema for structured debate

---

## 12. DEPLOYMENT ARCHITECTURE

```
┌────────────────────────┐     ┌────────────────────────┐
│ VERCEL                 │     │ RAILWAY                │
│                        │     │                        │
│ pooter.world (prod)    │     │ Agent Hub (Hono)       │
│ dev.pooter.world (dev) │◄───►│ heartfelt-flow         │
│                        │     │ Port 3100              │
│ - Next.js 16           │     │                        │
│ - ISR (60s revalidate) │     │ Pooter Indexer (Ponder)│
│ - Cron: /api/trading   │     │ - PostgreSQL 5GB       │
│ - Ephemeral FS         │     │ - Editorial archive    │
│                        │     │ - Market impact data   │
│ Team: mshrmstudio      │     │                        │
└────────────────────────┘     └────────────────────────┘
```

### Deploy Commands

```bash
# Web to dev (preview)
cd /Users/hugo/Downloads/morality.network-master/web
npx vercel && npx vercel alias <url> dev.pooter.world

# Web to prod
cd /Users/hugo/Downloads/morality.network-master/web
npx vercel --prod

# Agent Hub to Railway
cd /Users/hugo/agent-hub && railway up --detach
```

### Environment Variables

**Vercel (pooter.world):**
- `AGENT_HUB_URL` — agent-hub Railway URL
- `AGENT_HUB_SECRET` — shared auth token
- `BASE_MAINNET_RPC_URL` — Base L2 RPC
- `TRADER_PRIVATE_KEY` — HL trading wallet
- `HYPERLIQUID_WALLET_ADDRESS` — HL account address
- `HL_API_URL` — Hyperliquid API endpoint

**Railway (agent-hub):**
- `GROQ_API_KEY` — Groq free tier API key
- `TOGETHER_API_KEY` — fallback provider
- `AGENT_HUB_SECRET` — auth token
- `NEWSDESK_ENABLED=true`
- `NEWSDESK_INDEXER_URL` — pooter indexer URL
- `NEWSDESK_POLL_INTERVAL_MS=600000` (10 min)
- `NEWSDESK_EDITORIAL_LIMIT=50`

---

## 13. PROJECT STRUCTURE (Current)

```
morality.network-master/
├── web/                              # Next.js 16 app (pooter.world)
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx            # Root layout + providers
│   │   │   ├── page.tsx              # Home
│   │   │   ├── archive/              # Editorial archive
│   │   │   ├── signals/              # Trading signals dashboard
│   │   │   ├── bots/                 # Trading bot console
│   │   │   ├── markets/              # Market overview
│   │   │   ├── music/                # Music discovery
│   │   │   ├── entity/[hash]/        # Entity profiles
│   │   │   ├── leaderboard/          # Reputation rankings
│   │   │   ├── pepe/                 # Pepe asset tracker
│   │   │   ├── appendix/             # Reference pages
│   │   │   └── api/
│   │   │       ├── editorial/        # Editorial generation & management
│   │   │       ├── trading/          # Trading engine endpoints
│   │   │       ├── agents/           # Agent system (swarm, coordinator, scanner)
│   │   │       ├── sentiment/        # Sentiment analysis
│   │   │       ├── terminal/         # AI chat terminal
│   │   │       ├── governance/       # Protocol governance
│   │   │       ├── auth/             # SIWE authentication
│   │   │       └── ...
│   │   ├── components/
│   │   │   ├── trading/
│   │   │   │   ├── SignalDashboard.tsx     # Signal cards + newsdesk narrative
│   │   │   │   └── AsyncSignalDashboard.tsx
│   │   │   └── ...
│   │   └── lib/
│   │       ├── trading/              # Trading engine (22 files)
│   │       │   ├── engine.ts         # Core TraderEngine
│   │       │   ├── signals.ts        # Signal aggregation + newsdesk
│   │       │   ├── hyperliquid.ts    # HL API integration
│   │       │   ├── kelly.ts          # Kelly criterion
│   │       │   ├── config.ts         # Configuration
│   │       │   └── ...
│   │       ├── agents/               # Agent system
│   │       │   ├── core/             # Bus, memory, soul, registry
│   │       │   ├── trader/           # Trader agent
│   │       │   ├── scanner/          # Token scanner
│   │       │   ├── newsroom/         # Editorial coordination
│   │       │   └── ...
│   │       ├── editorial-archive.ts  # Editorial storage
│   │       ├── claude-editorial.ts   # AI editorial generation
│   │       ├── claim-extract.ts      # Claim extraction
│   │       ├── ai-provider.ts        # LLM provider routing
│   │       ├── rss.ts               # RSS feed fetching
│   │       ├── sentiment.ts          # Sentiment analysis
│   │       ├── bias.ts              # Bias detection
│   │       └── ...                   # 100+ lib files
│   └── ...
├── v2/
│   ├── web/                          # V2 Next.js app (superseded by /web)
│   └── contracts/
│       └── src/                      # Solidity 0.8.24 contracts
│           ├── MoralityRegistry.sol
│           ├── MoralityRatings.sol
│           ├── MoralityComments.sol
│           ├── MoralityTipping.sol
│           └── MoralityLeaderboard.sol
├── PDR.md                            # This file
└── ...legacy code...

agent-hub/                            # Separate repo (Railway)
├── src/
│   ├── index.ts                      # Hono server + route mounting
│   ├── providers/
│   │   ├── groq.ts                   # Groq API client
│   │   ├── together.ts              # Together.ai fallback
│   │   ├── router.ts                # Task-based model routing
│   │   └── types.ts                 # TaskId union, LLMRequest
│   ├── routes/
│   │   ├── generate.ts              # POST /v1/generate
│   │   ├── chat.ts                  # POST /v1/chat
│   │   └── health.ts               # GET /health
│   ├── newsdesk/
│   │   ├── types.ts                 # Newsdesk interfaces
│   │   ├── store.ts                 # In-memory signal store
│   │   ├── poller.ts                # Background indexer polling
│   │   ├── synthesizer.ts           # LLM synthesis + JSON extraction
│   │   ├── routes.ts                # GET /v1/newsdesk/*
│   │   └── index.ts                 # Boot function
│   └── middleware/
│       ├── auth.ts                  # Bearer token validation
│       └── telemetry.ts             # Usage tracking
└── .env.example
```

---

## 14. DATA FLOW — END-TO-END

```
RSS Feeds ──► Claim Extraction ──► Editorial Generation ──► Market Impact Analysis
  (12+)          (AI)                   (AI)                     (structured)
                                                                      │
                                                                      ▼
                                                            Pooter Indexer (PG)
                                                                      │
                                ┌──────────────────────────────────────┤
                                │                                      │
                                ▼                                      ▼
                        Newsdesk Agent                          Raw Aggregation
                        (agent-hub, Qwen3-32B)                  (signals.ts direct)
                                │                                      │
                                ▼                                      │
                        NewsdeskSignal[]                               │
                        + narrative                                    │
                        + suggestedAction                              │
                        + synthesisConfidence                          │
                                │                                      │
                                └──────────────┬───────────────────────┘
                                               │  (newsdesk preferred,
                                               │   raw as fallback)
                                               ▼
                                    ┌──────────────────┐
                                    │ /signals page    │  (display)
                                    │ Trading Engine   │  (entries/exits)
                                    └──────────────────┘
                                               │
                                               ▼
                                    Hyperliquid Perps
                                    (10x leverage, cross-margin)
                                               │
                                               ▼
                                    Position Monitoring
                                    (10-min cron cycle)
                                               │
                                    ┌──────────┴──────────┐
                                    │                     │
                                    ▼                     ▼
                              Trade Journal         /bots console
                              (PnL tracking)        (live status)
```

---

## 15. KEY DESIGN DECISIONS

### Newsdesk: Polling over Webhooks
The indexer has no push mechanism. Poll every 10 min, track `lastSeenHash` to skip LLM calls when no new editorials arrive. ~70 LLM calls/day fits Groq free tier (500K tokens/day).

### Signal Shape Compatibility
`NewsdeskSignal` extends `AggregatedMarketSignal` with 3 optional fields. TypeScript structural typing means existing code ignores extras — zero-change consumption.

### Trading: Signal-First Entry
The HL perp engine doesn't use token scanner candidates. Instead, newsdesk/aggregated signals drive entries directly. A synthetic placeholder candidate ensures the entry loop runs.

### Trading: Exit Priority
Exits are evaluated BEFORE new entries. Signal fetch happens before exit evaluation so signal-reversal exits have access to current market data.

### Vercel Ephemeral FS
`editorial-archive.json` doesn't persist between serverless invocations. ISR caching (`revalidate`) prevents re-generating AI editorials on every request. Critical data lives in the Ponder indexer (PostgreSQL on Railway).

### Agent Hub: $0/Day LLM Costs
Groq free tier handles all LLM calls. Together.ai as fallback. No direct Anthropic/OpenAI API costs in production.

---

## 16. KEY PRINCIPLES

1. **Permissionless** — No accounts, no emails, no gatekeepers. Wallet = identity.
2. **Censorship Resistant** — All ratings, comments, and tips stored onchain. Nobody can delete them.
3. **Direct Value** — Tips go directly to creators. No platform cut (or minimal 1%).
4. **Universal** — Works for any URL, domain, ETH address, or smart contract.
5. **Cheap** — Base L2 makes every interaction cost fractions of a cent.
6. **Open** — All data is onchain and publicly verifiable. No black box algorithms.
7. **Autonomous** — Trading engine and newsdesk agent run without human intervention.
8. **Graceful Degradation** — Every system has a fallback (newsdesk → raw aggregation, Groq → Together.ai, etc.)

---

## 17. LEGACY CODE REFERENCE

The existing codebase at `/morality.network-master/` contains:
- **Smart Contracts** — Solidity 0.5.x/0.8.x rating + content storage contracts
- **Rating Models** — 5-field rating structure (simplified to single score in v2)
- **Comment System** — Threaded comments with upvotes
- **Chrome Extension** — Content script injection patterns
- **Backend Architecture** — .NET Repository + Service pattern (replaced by Next.js API routes)

---

## 18. WHAT'S NEXT

- [ ] Push trading fixes + newsdesk integration to prod (currently on dev)
- [ ] Tune trading parameters based on newsdesk signal quality
- [ ] Add more ticker coverage to TICKER_ALIASES (crypto alts, forex pairs)
- [ ] Deploy contracts to Base Sepolia testnet
- [ ] Wire up Prisma + PostgreSQL for onchain event indexing
- [ ] Domain ownership verification (DNS TXT, ENS, meta tag)
- [ ] Chrome extension port from v1
