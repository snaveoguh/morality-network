# Architecture

Last updated: 2026-03-24.

## Monorepo Layout

```text
web/            # Next.js 16 app + API routes + feed UI (pooter.world)
contracts/      # Solidity 0.8.24 contracts + Foundry scripts/tests
docs/           # Documentation
extension/      # Chrome extension (deferred from first-wave launch)
```

## System Overview

```text
Browser (web or extension UI)
  -> Wallet (wagmi/viem, Base L2)
  -> Solidity contracts (registry, ratings, comments, tipping, leaderboard,
     prediction market, agent vault, editions, auctions, proposal voting)
  -> Events emitted onchain
  -> Ponder indexer ingests events into query tables (Railway)
  -> Agent system (scanner, swarm, trader, scalper) runs in worker/API context
  -> AI editorial pipeline generates content via Agent Hub (Groq/Llama)
  -> Public API endpoints expose feed/governance/trading/editorial data
```

## Contracts Layer (`contracts/src`)

### Core Contracts (5)
- `MoralityRegistry.sol`: Universal entity registration and ownership claim flow.
- `MoralityRatings.sol`: Entity ratings with `rateWithReason` and reason retrieval.
- `MoralityComments.sol`: Threaded comments and voting.
- `MoralityTipping.sol`: Entity/comment tipping and escrow withdrawal.
- `MoralityLeaderboard.sol`: Composite scoring (40% rating + 30% AI + 20% tips + 10% engagement).

### Product Contracts (3)
- `MoralityPredictionMarket.sol`: Binary prediction markets on proposal outcomes.
- `PooterEditions.sol`: Daily edition NFTs (ERC-1155).
- `PooterAuctions.sol`: Auction system for edition minting.

### Governance & Vault (2)
- `MoralityProposalVoting.sol`: Proposal/voting (optional, requires NOUNS_TOKEN).
- `MoralityAgentVault.sol`: Shared vault for AI agent strategy allocation.

### Vault Rail Contracts (10)
Base -> Arbitrum -> Hyperliquid capital pipeline:
- **Base side:** BaseCapitalVault, WithdrawalQueue, MorphoReserveAllocator, BridgeRouter, NavReporter, ExecutorAssetConverter, ExecutorBridgeAdapter
- **Arbitrum side:** ArbTransitEscrow, HLStrategyManager
- **Dev helpers:** DevReserveVault, DevUSDC (testnet only)

All contracts use **UUPS upgradeable proxy pattern** with OpenZeppelin.

Deploy script: `contracts/script/DeployAll.s.sol`

## Web App Layer (`web`)

- **Framework:** Next.js 16.1.6 (App Router, Turbopack)
- **Styling:** Tailwind CSS (newspaper aesthetic)
- **Wallet:** wagmi v2 + viem + RainbowKit
- **Auth:** SIWE (Sign-In With Ethereum)

### Primary Surfaces
| Route | Purpose |
|-------|---------|
| `/` | Newspaper-style mixed feed with daily edition masthead |
| `/proposals` | Multi-source governance stream (Nouns, Lil Nouns, Parliament, EU) |
| `/predictions` | Binary prediction markets on proposal outcomes |
| `/signals` | Trading signals aggregated from editorial analysis |
| `/leaderboard` | Entity ranking + composite scoring |
| `/discuss` | Onchain discussion rooms |
| `/nouns` | Nouns NFT marketplace (Seaport) |
| `/pepe` | Rare Pepe marketplace (Emblem Vault) |
| `/markets` | Live crypto market data |
| `/sentiment` | AI-generated market sentiment |
| `/archive` | Editorial archive |
| `/vault` | Vault rail architecture visualization |
| `/stumble` | Random content discovery |
| `/terminal` | LLM-powered chat terminal |

### API Layer
73 API routes under `web/src/app/api/` — see [API_REFERENCE.md](API_REFERENCE.md).

### Agent System
Five registered agents running in the web app context:

| Agent | Purpose |
|-------|---------|
| `bus-coordinator` | Dispatches tasks, relays messages between agents and bridges |
| `launch-scanner` | Scans for token launches and evaluates opportunities |
| `research-swarm` | Multi-agent research on topics/tokens |
| `trader` | Executes trades on Hyperliquid perps based on composite signals |
| `scalper` | Short-term scalping with 30min max hold, 10min cooldown |

Agent bus bridges to noun.wtf for cross-project coordination.

### Caching & Storage
- **Upstash Redis:** Editorial archive caching, session data
- **In-memory caches:** Feed items (15min TTL), AI scores (30min TTL), market data
- **File-backed archives:** `article-archive.json`, `editorial-archive.json` (legacy, being migrated to Redis + remote indexer)
- **Remote indexer:** Railway-hosted Ponder API for persistent data

### AI Pipeline
- **Agent Hub** (Railway): Centralized LLM service using Groq free tier (Llama 3.3 70B). Hono server with fallback to Together.ai.
- **Editorial generation:** 3-pass pipeline (writer -> extractor -> editor) via Agent Hub
- **DALL-E 3:** Cover art illustrations via OpenAI API
- **Sentiment scoring:** AI-generated market sentiment from editorial analysis
- **Trading signals:** Extracted from editorials + technical indicators

## Extension Layer (`extension`)

- `src/content`: Page detection/highlight, tooltip, side panel, overlay.
- `src/background`: Wallet and contract action handlers.
- `src/popup`: Extension popup UI (kawaii pooter face with cursor-tracking eyes).
- `src/shared`: Contract ABIs, hashing, typing, known entities, RPC helpers.
- **Status:** Deferred from first-wave launch. Popup UI updated, core interaction flow needs work.

## Indexer Layer (`indexer`)

- **Runtime:** Ponder (event indexing framework)
- **Database:** PostgreSQL (Railway)
- **Schema:** Tracks entity, rating, comment, tip, feed_item, comment_vote
- **Event processors:** Map contract events into denormalized query tables
- **API:** Hono server with entity, feed, and governance endpoints

## Data Boundaries

- **Onchain** is source of truth for ratings/comments/tips state.
- **Indexer** is query acceleration and analytics layer.
- **Redis** is hot cache for editorials, sessions, and frequently-accessed data.
- **Web API routes** combine indexed data, governance APIs, RSS aggregation, AI generation, trading signals, and wallet-auth workflows.
- **Agent state** persisted via indexer APIs and in-memory during runtime.

## ISR Strategy

Pages use Incremental Static Regeneration with tiered intervals:
- **30s:** Markets API (real-time price data for scalper)
- **15min:** Homepage (news feed)
- **1hr:** Secondary pages (signals, proposals, predictions, pepe, discuss, nouns)
- **1 day:** Static reference data (appendix, OG images)

## Deliberation Graph Direction

Target canonical model:

```text
entity
  -> claim (canonical statement)
  -> interpretations (claim/counterclaim/evidence/source)
  -> outcomes (resolved/uncertain/contradicted)
  -> derived reputation signals
```

Polis interoperability maps to this model as:
- Polis conversation -> `entity`
- Polis statement -> `claim` or `interpretation`
- Polis votes (agree/disagree/pass) -> interpretation signal edges
- Polis clusters/consensus output -> graph-level summary artifacts

## Runtime Config Hotspots

- Web contract config: `web/src/lib/contracts.ts`
- Worker runtime config: `web/.env.example` and `docs/LAUNCH_HARDENING.md`
- Extension contract config: `extension/src/shared/contracts.ts`
- Foundry deploy env: `contracts/.env` (`PRIVATE_KEY`, `BASE_SEPOLIA_RPC_URL`, optional oracle/token addresses)
- Agent Hub config: `AGENT_HUB_URL` env var
- Trading config: `TRADER_*` env vars in `docs/DEPLOYMENTS.md`
