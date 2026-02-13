# MO — Permissionless News & Onchain Discussion

A censorship-resistant news feed and discussion platform where conversations happen onchain (Base L2) and value flows directly between readers and creators.

## What is this?

- **Feed** — Aggregated RSS news from major sources, filterable by category
- **Leaderboard** — Universal reputation rankings for domains, ETH addresses, smart contracts, and URLs
- **Onchain Discussion** — Rate, comment, upvote/downvote — all stored permanently onchain
- **Tipping** — Send ETH directly to content creators, site owners, and commenters on Base L2
- **Universal Entity System** — Every URL, domain, ETH address, and smart contract gets a reputation profile

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router) + Tailwind CSS |
| Wallet | wagmi v2 + viem + RainbowKit |
| Auth | Sign-In With Ethereum (SIWE) |
| Chain | Base L2 (Ethereum) |
| Contracts | Solidity 0.8.24 + Foundry |
| Token | MO (ERC-20) — `0x8729c70061739140ee6bE00A3875Cbf6d09A746C` on Base |

## Smart Contracts

- `MoralityRegistry.sol` — Universal entity registration
- `MoralityRatings.sol` — 1-5 star onchain ratings
- `MoralityComments.sol` — Threaded comments with voting
- `MoralityTipping.sol` — ETH tipping with escrow for unclaimed entities
- `MoralityLeaderboard.sol` — Composite scoring (40% rating + 30% AI + 20% tips + 10% engagement)

## Getting Started

```bash
cd v2/web
npm install --legacy-peer-deps
npm run dev
# Open http://localhost:3000
```

## Scoring Formula

```
compositeScore = (onchainRating × 0.4) + (aiScore × 0.3) + (tipVolume × 0.2) + (engagement × 0.1)
```

## License

MIT

## Links

- Website: [mo.network](https://mo.network)
- Token: [MO on Base](https://basescan.org/token/0x8729c70061739140ee6bE00A3875Cbf6d09A746C)
