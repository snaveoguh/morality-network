# Appendix — pooter.world

Technical reference for all smart contracts, API endpoints, and infrastructure.
Machine-readable companion: `GET /api/appendix` (JSON).

---

## Smart Contracts — Base Mainnet (Chain ID: 8453)

All upgradeable contracts use ERC-1967 UUPS proxy pattern. Solidity 0.8.24.

| Contract | Address | Type |
|---|---|---|
| MoralityRegistry | `0x2ea7502C4db5B8cfB329d8a9866EB6705b036608` | UUPS Proxy |
| MoralityRatings | `0x29F66D8b15326cE7232c0277DBc2CbFDaaf93405` | UUPS Proxy |
| MoralityComments | `0x66BA3cE1280bF86DFe957B52e9888A1De7F81d7b` | UUPS Proxy |
| MoralityTipping | `0x27c79A57BE68EB62c9C6bB19875dB76D33FD099B` | UUPS Proxy |
| MoralityLeaderboard | `0x29f0235d74E09536f0b7dF9C6529De17B8aF5Fc6` | UUPS Proxy |
| MoralityAgentVault | `0x4B48d35E019129bb5a16920ADC4Cb7F445ec8cA5` | UUPS Proxy |
| PooterEditions | `0x06d7c7d70c685d58686FF6E0b0DB388209fCCC6e` | UUPS Proxy · ERC-721 |
| PooterAuctions | `0x527e2D6Ae259E3531e4d38A5f634Fd1F788Fc71f` | Immutable |
| MO Token | `0x8729c70061739140ee6bE00A3875Cbf6d09A746C` | ERC-20 |
| MoralityProposalVoting | pending deploy | UUPS Proxy |

Explorer: `https://basescan.org/address/<ADDRESS>`

---

## Smart Contracts — Base Sepolia Testnet (Chain ID: 84532)

Same contract source as mainnet. Used by `dev.pooter.world`.

| Contract | Proxy Address | Implementation |
|---|---|---|
| MoralityRegistry | `0x661674e3Bf03B644a755c0438E3F2168a4d6aa13` | `0xbaa0f71a3b788cdab19383b18ea5894981b308d9` |
| MoralityRatings | `0x527e2D6Ae259E3531e4d38A5f634Fd1F788Fc71f` | `0x510fb45089f2d93cb27f313cced22b440734f33b` |
| MoralityComments | `0xd17E13507f8005048a3fcf9850F2dF65c56e3005` | `0x73db7cda31fb9104f800c969b4732178c7ba8170` |
| MoralityTipping | `0x8b632dF91E59Fb14C828E65E3e1f6eea2180721e` | `0x8f99c886d84ceff9f62f4d5706751e4871cf7e2e` |
| MoralityLeaderboard | `0xf7294B25396E77Fcf6af3f38A3116737df229080` | `0x02f32c1f1780c1c028f2bcb9ad9f1d857eebb564` |
| MoralityPredictionMarket | `0x57bB5C8a19385bCBD366EEcDCFDfA59f47744058` | `0x0b672bdb380010e848e801b8ffacea700e60dd7f` |
| MoralityAgentVault | `0x781A6904a00b8B1a03ba358011A9BF9720eeC531` | `0x83180abffce65523bc6de88d7d4eebdc12de8fb7` |
| PooterEditions | `0x7Ec524d8804cA86562F6892de58CCDc22260CA42` | `0x65a87b4157ac5396bd2e32ae0c080ae40b93fd88` (upgraded: `0x30e49f9Bc0E11b90F3828597e061c78388978DDa`) |
| PooterAuctions | `0xe1D407E486b5943d773FAC9A145a5308b14cC225` | Immutable |
| MoralityProposalVoting | not deployed | Requires NOUNS_TOKEN |

Wiring: Treasury `0xae4705dC0816ee6d8a13F1C72780Ec5021915Fed` · Editions minter `0xe1D407E486b5943d773FAC9A145a5308b14cC225`

Explorer: `https://sepolia.basescan.org/address/<ADDRESS>`

---

## Smart Contracts — Ethereum Mainnet (Chain ID: 1)

| Contract | Address | Type |
|---|---|---|
| MoralityPredictionMarket | `0x2ea7502C4db5B8cfB329d8a9866EB6705b036608` | UUPS Proxy |

Trustless resolution via native `governor.state()` calls.
Markets auto-open on first stake; cancelled proposals resolve to VOID (full refund).

---

## Nouns Ecosystem — Ethereum Mainnet (Read-Only)

| Contract | Address | Type |
|---|---|---|
| Nouns Token | `0x9C8fF314C9Bc7F6e59A9d9225Fb22946427eDC03` | ERC-721 |
| Nouns Governor V4 | `0x6f3E6272A167e8AcCb32072d08E0957F9c79223d` | Governor Bravo |
| Nouns Treasury | `0x0BC3807Ec262cB779b38D65b38158acC3bfedE10` | Executor / Timelock |
| Nouns Auction House | `0x830BD73E4184ceF73443C15111a1DF14e495C706` | Proxy |
| Nouns Descriptor | `0x0Cfdb3Ba1694c2bb2CFACB0339ad7b1Ae5932B63` | SVG Renderer |
| Lil Nouns Governor | `0x5d2C31ce16924C2a71D317e5BbFd5ce387854039` | Governor Bravo |

---

## API Endpoints

Base URL: `https://pooter.world` (prod) / `https://dev.pooter.world` (dev)

Auth levels: PUBLIC = no auth, AUTH = SIWE session, HOLDER = MO token holder gate.

### Feed & Content
| Method | Path | Description | Auth |
|---|---|---|---|
| GET | /api/feed | Aggregated RSS feed | PUBLIC |
| GET | /api/feed/sources | Feed source list | PUBLIC |
| GET | /api/stumble | Random article | PUBLIC |
| GET | /api/search | Full-text search | PUBLIC |
| GET | /api/newsroom | Newsroom data | AUTH |
| GET | /api/health/sources | Feed health check | PUBLIC |

### Markets & Sentiment
| Method | Path | Description | Auth |
|---|---|---|---|
| GET | /api/markets | Crypto market data | PUBLIC |
| GET | /api/sentiment | Sentiment metrics | PUBLIC |
| GET | /api/sentiment/history | Sentiment history | PUBLIC |

### Governance
| Method | Path | Description | Auth |
|---|---|---|---|
| GET | /api/governance | Nouns/Lil Nouns proposals | PUBLIC |
| GET | /api/governance/[id] | Single proposal detail | PUBLIC |
| GET | /api/v1/governance/live | Live governance feed | PUBLIC |
| POST | /api/proposals/ops | Proposal operations | AUTH |

### Predictions
| Method | Path | Description | Auth |
|---|---|---|---|
| GET | /api/predictions/ops | Operator dashboard | AUTH |

### Discussion
| Method | Path | Description | Auth |
|---|---|---|---|
| GET | /api/discuss/stream | Discussion streaming | PUBLIC |
| POST | /api/discuss/stream | Post discussion | AUTH |

### AI & Scoring
| Method | Path | Description | Auth |
|---|---|---|---|
| POST | /api/ai/score | AI scoring | AUTH |
| POST | /api/editorial/mark-onchain | Mark editorial content | AUTH |
| POST | /api/editorial/pregenerate | Pre-generate content | AUTH |
| GET | /api/evidence/verify | Verify evidence | AUTH |
| GET | /api/deliberation/schema | Deliberation schema | PUBLIC |
| GET | /api/analysts/reputation | Analyst reputation | PUBLIC |
| GET | /api/analysts/interpretations | Analyst interpretations | PUBLIC |

### Trading
| Method | Path | Description | Auth |
|---|---|---|---|
| GET | /api/trading/signals | Trading signals | PUBLIC |
| GET | /api/trading/signals/live | Live composite signals | HOLDER |
| POST | /api/trading/execute | Execute trades | AUTH |
| GET | /api/trading/metrics | Trading metrics | PUBLIC / HOLDER-FULL |
| GET | /api/trading/positions | Trading positions | AUTH |
| GET | /api/trading/readiness | Trading readiness | AUTH |
| GET | /api/trading/candles | OHLCV candlestick data | PUBLIC |
| GET | /api/trading/indicators | Technical indicators (RSI, MACD) | PUBLIC |
| GET | /api/trading/journal | Trade execution journal | AUTH |
| GET | /api/trading/performance | Portfolio performance metrics | AUTH |
| GET | /api/trading/learning | Self-learning report | AUTH |

### Agents
| Method | Path | Description | Auth |
|---|---|---|---|
| GET | /api/agents | Agent list | AUTH |
| POST | /api/agents | Create agent | AUTH |
| GET | /api/agents/scanner | Token scanner | PUBLIC |
| GET | /api/agents/scanner/[token] | Specific token analysis | PUBLIC |
| GET | /api/agents/bus | Agent message bus | AUTH |
| POST | /api/agents/bus/relay | Message relay | AUTH |
| GET | /api/agents/coordinator | Agent coordination | AUTH |
| GET | /api/agents/console | Agent console | AUTH |
| GET | /api/agents/events/stream | Agent events (SSE) | AUTH |
| POST | /api/agents/memory/learn | Learning endpoint | AUTH |
| POST | /api/agents/memory/self-learn | Self-learning | AUTH |
| GET | /api/agents/memory/stats | Memory stats | AUTH |
| GET | /api/agents/memory/debug | Memory debug | AUTH |
| GET | /api/agents/swarm | Research swarm output | AUTH |

### Auth (SIWE)
| Method | Path | Description | Auth |
|---|---|---|---|
| POST | /api/auth/nonce | Generate SIWE nonce | PUBLIC |
| POST | /api/auth/verify | Verify SIWE signature | PUBLIC |
| GET | /api/auth/session | Session status | PUBLIC |

### Pepe
| Method | Path | Description | Auth |
|---|---|---|---|
| GET | /api/pepe/[asset] | Asset detail | PUBLIC |
| GET | /api/pepe/listings | Pepe listings | PUBLIC |
| GET | /api/pepe/img/[asset] | Pepe image proxy | PUBLIC |

### Editions & Auctions
| Method | Path | Description | Auth |
|---|---|---|---|
| GET | /api/edition/[tokenId] | Edition / community-claim metadata | PUBLIC |
| GET | /api/edition/[tokenId]/image | Edition / community-claim image | PUBLIC |
| GET | /api/daily-edition | Daily edition | PUBLIC |

### Terminal & Music
| Method | Path | Description | Auth |
|---|---|---|---|
| POST | /api/terminal/chat | Terminal chat (AI) — bankr engine | HOLDER |
| GET | /api/terminal/subscription/status | Subscription status | PUBLIC |
| POST | /api/terminal/risk | Risk assessment — venice engine | HOLDER |
| GET | /api/music/discover | Music discovery | PUBLIC |

### Protocol
| Method | Path | Description | Auth |
|---|---|---|---|
| GET | /api/protocol-wire | Protocol wire | PUBLIC |
| POST | /api/protocol-wire | Submit to wire | AUTH |

### Moral Compass
| Method | Path | Description | Auth |
|---|---|---|---|
| GET | /api/moral-compass/crawl | Ethics/philosophy crawl (cron) | AUTH |
| GET | /api/moral-compass/status | Compass stats & context | PUBLIC |

### Moral Commentary
| Method | Path | Description | Auth |
|---|---|---|---|
| GET | /api/moral-commentary/generate | Daily moral commentary (cron) | AUTH |

### Appendix
| Method | Path | Description | Auth |
|---|---|---|---|
| GET | /api/appendix | This reference as JSON | PUBLIC |

---

## Infrastructure

| Service | URL | Platform |
|---|---|---|
| Production | https://pooter.world | Vercel |
| Dev/Preview | https://dev.pooter.world | Vercel (aliased preview) |
| Agent Hub | https://heartfelt-flow-production-d872.up.railway.app | Railway |

## Dev Site Wiring (Base Sepolia)

Set these env vars on Vercel preview to point dev at Sepolia:

```
NEXT_PUBLIC_CONTRACTS_CHAIN_ID=84532
NEXT_PUBLIC_AGENT_VAULT_CHAIN_ID=84532
NEXT_PUBLIC_REGISTRY_ADDRESS=0x661674e3Bf03B644a755c0438E3F2168a4d6aa13
NEXT_PUBLIC_RATINGS_ADDRESS=0x527e2D6Ae259E3531e4d38A5f634Fd1F788Fc71f
NEXT_PUBLIC_COMMENTS_ADDRESS=0xd17E13507f8005048a3fcf9850F2dF65c56e3005
NEXT_PUBLIC_TIPPING_ADDRESS=0x8b632dF91E59Fb14C828E65E3e1f6eea2180721e
NEXT_PUBLIC_LEADERBOARD_ADDRESS=0xf7294B25396E77Fcf6af3f38A3116737df229080
NEXT_PUBLIC_AGENT_VAULT_ADDRESS=0x781A6904a00b8B1a03ba358011A9BF9720eeC531
NEXT_PUBLIC_POOTER_EDITIONS_ADDRESS=0x7Ec524d8804cA86562F6892de58CCDc22260CA42
NEXT_PUBLIC_POOTER_AUCTIONS_ADDRESS=0xe1D407E486b5943d773FAC9A145a5308b14cC225
NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS=0x57bB5C8a19385bCBD366EEcDCFDfA59f47744058
```

Note: Predictions on dev currently point at Ethereum mainnet prediction market for live Nouns/Lil Nouns resolved cards (`NEXT_PUBLIC_PREDICTION_MARKET_CHAIN_ID=1`).
