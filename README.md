# Pooter World — Permissionless Onchain News & AI Editorials

A censorship-resistant news feed, AI editorial engine, and discussion platform where conversations happen onchain (Base L2) and value flows directly between readers and creators.

**Live:** [pooter.world](https://pooter.world) | **Dev:** [dev.pooter.world](https://dev.pooter.world)

## What is this?

- **AI Newsroom** — Automated editorial pipeline: crawls RSS feeds, generates AI editorials with market-impact analysis, publishes daily editions with DALL-E cover art
- **Daily Edition** — Newspaper-style front page generated every 6 hours, mintable as onchain NFTs
- **Onchain Discussion** — Rate, comment, upvote/downvote — all stored permanently on Base L2
- **Tipping** — Send ETH directly to content creators, site owners, and commenters
- **Leaderboard** — Universal reputation rankings for domains, ETH addresses, smart contracts, and URLs
- **Trading Signals** — Market-impact extraction from editorials, aggregated into tradeable signals
- **Moral Compass** — AI-generated philosophical commentary on current events

## Architecture

```
web/                    # Next.js web application (pooter.world)
contracts/              # Solidity smart contracts (Foundry)
docs/                   # Documentation
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router) + Tailwind CSS |
| Wallet | wagmi v2 + viem + RainbowKit |
| Auth | Sign-In With Ethereum (SIWE) |
| Chain | Base L2 (Ethereum) |
| Contracts | Solidity 0.8.24 + Foundry + UUPS Proxies |
| AI | Agent Hub (Groq/Llama 3.3 70B) + OpenAI DALL-E 3 |
| Storage | Upstash Redis + Remote Indexer + ISR |
| Token | MO (ERC-20) — `0x8729c70061739140ee6bE00A3875Cbf6d09A746C` on Base |

## Smart Contracts (10)

| Contract | Purpose |
|----------|---------|
| `MoralityRegistry.sol` | Universal entity registration (URL, domain, address, contract) |
| `MoralityRatings.sol` | 1-5 star onchain ratings |
| `MoralityComments.sol` | Threaded comments with voting |
| `MoralityTipping.sol` | ETH tipping with escrow for unclaimed entities |
| `MoralityLeaderboard.sol` | Composite scoring (40% rating + 30% AI + 20% tips + 10% engagement) |
| `MoralityPredictionMarket.sol` | Binary prediction markets on entity outcomes |
| `MoralityAgentVault.sol` | Shared vault for AI agent strategy allocation |
| `MoralityProposalVoting.sol` | Governance proposals with quorum-based voting |
| `PooterEditions.sol` | Daily edition NFTs (ERC-1155) |
| `PooterAuctions.sol` | Auction system for edition minting |

All contracts use **UUPS upgradeable proxy pattern** with OpenZeppelin.

## Getting Started

```bash
# 1. Install dependencies
cd web
npm install --legacy-peer-deps

# 2. Set up environment variables
cp .env.example .env.local
# Edit .env.local with your keys (see Environment Variables below)

# 3. Run the dev server
npm run dev
# Open http://localhost:3000
```

### Environment Variables

```env
# Required
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=   # WalletConnect Cloud
UPSTASH_REDIS_REST_URL=                 # Upstash Redis REST URL
UPSTASH_REDIS_REST_TOKEN=               # Upstash Redis REST Token

# AI Providers (at least one required for editorial generation)
AGENT_HUB_URL=                          # Agent Hub URL (primary)
OPENAI_API_KEY=                         # DALL-E 3 illustrations

# Cron Security (required in production)
CRON_SECRET=                            # Vercel cron auth token
GOD_MODE_SECRET=                        # Editorial edit auth token
GOD_MODE_ADDRESSES=                     # Comma-separated wallet addresses

# Optional
INDEXER_BACKEND_URL=                    # Remote indexer for persistence
NEWSROOM_SECRET=                        # Newsroom API auth
```

### Smart Contracts

```bash
cd contracts
forge install
forge build
forge test
```

## Cron Schedule (Vercel)

| Endpoint | Schedule | Purpose |
|----------|----------|---------|
| `/api/moral-compass/crawl` | Daily 3 AM UTC | Crawl ethics/philosophy sources |
| `/api/moral-commentary/generate` | Daily 4 AM UTC | Generate moral commentary |
| `/api/editorial/pregenerate` | Daily 5 AM UTC | Pre-generate editorials for feed items |
| `/api/cron/daily-edition` | Every 6h (5:30, 11:30, 17:30, 23:30 UTC) | Generate daily newspaper edition |
| `/api/cron/daily-illustration` | Every 6h (5:45, 11:45, 17:45, 23:45 UTC) | Generate DALL-E cover art |
| `/api/newsroom` | Every 2h | Generate Pooter Originals for top stories |
| `/api/trading/execute` | Every 10 min | Execute trading signal cycle |

All cron endpoints require `CRON_SECRET` Bearer token authentication.

## Scoring Formula

```
compositeScore = (onchainRating x 0.4) + (aiScore x 0.3) + (tipVolume x 0.2) + (engagement x 0.1)
```

## Documentation

- [Architecture Report](docs/POOTER_WORLD_ARCHITECTURE_REPORT.md) — Board-facing technical overview
- [Architecture](docs/ARCHITECTURE.md) — System design and data flow
- [API Reference](docs/API_REFERENCE.md) — Endpoint documentation
- [Deployments](docs/DEPLOYMENTS.md) — Deployment procedures
- [Launch Hardening](docs/LAUNCH_HARDENING.md) — Production checklist
- [Style Guide](docs/STYLE_GUIDE.md) — UI/UX design system
- [Contributing](docs/CONTRIBUTING.md) — Contribution guidelines

## Deployment

```bash
# Deploy to dev (preview)
cd web && npx vercel && npx vercel alias <url> dev.pooter.world

# Deploy to production
cd web && npx vercel --prod
```

## License

MIT
