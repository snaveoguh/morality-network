# Morality.Network v2 — Product Design Reference (PDR)

## Source of Truth Document
**Last Updated:** 2026-02-13
**Status:** Active Development

---

## 1. VISION

A permissionless, censorship-resistant news feed and discussion platform where:
- Anyone can read and discuss news without paywalls or gatekeeping
- All conversations happen onchain (Base L2) making them uncensorable
- Value flows directly: readers tip content creators, commenters, and site owners
- Every entity (domain, ETH address, smart contract, URL) has a universal reputation score
- Ethereum wallet = your identity. No emails, no passwords, no middlemen.

**The Big Unlock:** Attaching real economic value (0x addresses on Base) to all content, enabling direct value exchange between consumers and creators — bypassing all intermediaries.

---

## 2. CORE ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js 14)                     │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │  Feed Tab     │  │ Leaderboard  │  │  Entity Profile   │ │
│  │  - RSS items  │  │ - Top sites  │  │  - Any URL        │ │
│  │  - Trending   │  │ - Top addys  │  │  - Any 0x address │ │
│  │  - Comments   │  │ - Top posts  │  │  - Any contract   │ │
│  │  - Tips sent  │  │ - AI scores  │  │  - Rating + tips  │ │
│  └──────────────┘  └──────────────┘  └───────────────────┘ │
│                                                              │
│  Auth: Sign-In With Ethereum (SIWE) via wallet connect      │
│  Wallet: wagmi + viem + RainbowKit/ConnectKit               │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                 BACKEND (Next.js API Routes)                 │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐ │
│  │  RSS Engine   │  │  Indexer     │  │  AI Rating        │ │
│  │  - Fetch      │  │  - Onchain   │  │  - Content score  │ │
│  │  - Parse      │  │    events    │  │  - Credibility    │ │
│  │  - Normalize  │  │  - Cache     │  │  - Sentiment      │ │
│  │  - Rank       │  │  - Aggregate │  │  - Quality        │ │
│  └──────────────┘  └──────────────┘  └───────────────────┘ │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────┐
│              BASE L2 (Ethereum Layer 2)                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  MoralityRegistry.sol                                │   │
│  │  - registerEntity(entityHash, entityType, metadata)  │   │
│  │  - Entity types: URL, DOMAIN, ADDRESS, CONTRACT      │   │
│  │                                                      │   │
│  │  MoralityRatings.sol                                 │   │
│  │  - rate(entityHash, score, comment)                  │   │
│  │  - getAverageRating(entityHash)                      │   │
│  │  - getRatings(entityHash, page)                      │   │
│  │                                                      │   │
│  │  MoralityComments.sol                                │   │
│  │  - comment(entityHash, content, parentId)            │   │
│  │  - upvote(commentId) / downvote(commentId)           │   │
│  │  - getComments(entityHash, page)                     │   │
│  │                                                      │   │
│  │  MoralityTipping.sol                                 │   │
│  │  - tip(entityHash, recipient) payable                │   │
│  │  - tipComment(commentId) payable                     │   │
│  │  - withdraw()                                        │   │
│  │  - getTipsReceived(address)                          │   │
│  │                                                      │   │
│  │  MoralityLeaderboard.sol                             │   │
│  │  - updateScore(entityHash, newScore)                 │   │
│  │  - getTopEntities(entityType, count)                 │   │
│  │  - AI oracle integration for automated scoring       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  Database: PostgreSQL (caching/indexing layer)               │
│  - Indexes onchain events for fast queries                   │
│  - Caches RSS feeds                                          │
│  - Stores AI rating results                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. TECH STACK

| Layer | Technology | Why |
|-------|-----------|-----|
| Frontend | Next.js 14 (App Router) | SSR, RSC, API routes in one |
| Styling | Tailwind CSS | Fast iteration |
| Wallet | wagmi v2 + viem + ConnectKit | Best Base L2 wallet UX |
| Auth | SIWE (Sign-In With Ethereum) | Permissionless identity |
| Blockchain | Base L2 (Ethereum) | Cheap txns (~$0.001), fast confirmations |
| Contracts | Solidity 0.8.x + Foundry | Modern tooling, gas optimized |
| Database | PostgreSQL + Prisma | Indexing layer for onchain data |
| RSS | rss-parser + custom aggregator | Feed ingestion |
| AI Rating | OpenAI/Claude API | Content quality scoring |
| Hosting | Vercel | Zero-config Next.js deploy |

---

## 4. TWO-TAB INTERFACE

### Tab 1: FEED
The main content stream. Shows:

1. **RSS Aggregated Content**
   - Major news sources (configurable)
   - Crypto/web3 news feeds
   - Tech news feeds
   - User-submitted feeds
   - Each item shows: title, source, timestamp, onchain rating, tip count

2. **Trending Content**
   - Most discussed (by onchain comment count)
   - Most tipped (by ETH volume)
   - Most rated (by rating count)
   - Hot takes (high engagement velocity)

3. **Per-Item Actions**
   - Rate (1-5 stars, stored onchain)
   - Comment (onchain, threaded)
   - Tip creator/site owner (ETH on Base)
   - Share
   - View entity profile

### Tab 2: LEADERBOARD
Universal reputation rankings across entity types:

1. **Domains/Sites**
   - Ranked by: onchain rating aggregate + AI credibility score
   - Shows: domain, avg rating, total tips received, comment count
   - Verified ownership badge (via DNS TXT record or ENS)

2. **ETH Addresses**
   - Ranked by: community rating + transaction reputation
   - Shows: address/ENS, rating, tips given/received, comment count

3. **Smart Contracts**
   - Ranked by: audit score + community rating + AI analysis
   - Shows: contract address, rating, interaction count

4. **Content Pieces**
   - Top rated articles/URLs of all time
   - Most tipped content

**Scoring Formula:**
```
totalScore = (onchainRatingAvg * 0.4) + (aiScore * 0.3) + (tipVolume * 0.2) + (engagementScore * 0.1)
```

---

## 5. ENTITY SYSTEM

Everything is an "entity" with a universal profile:

```typescript
type EntityType = 'URL' | 'DOMAIN' | 'ADDRESS' | 'CONTRACT';

interface Entity {
  hash: bytes32;           // keccak256 of the identifier
  entityType: EntityType;
  identifier: string;      // the actual URL/address/domain
  ratings: Rating[];
  comments: Comment[];
  tipsReceived: bigint;    // total ETH tipped to this entity
  ownerAddress?: address;  // claimed owner (verified)
  aiScore?: number;        // 0-100 AI credibility score
  createdAt: uint256;
}
```

**Entity Resolution:**
- `https://nytimes.com/article/123` → URL entity
- `nytimes.com` → DOMAIN entity
- `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` → ADDRESS entity
- `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (USDC on Base) → CONTRACT entity

---

## 6. ONCHAIN INTERACTIONS

### Rating
- 1-5 star rating stored onchain
- One rating per wallet per entity (can update)
- Gas cost on Base: ~$0.001-0.005

### Commenting
- Text stored onchain (IPFS for long content, hash onchain)
- Threaded replies (parentId reference)
- Upvote/downvote (onchain)
- Gas cost on Base: ~$0.002-0.01

### Tipping
- Direct ETH transfer to entity owner/creator
- If no verified owner → held in escrow (claimable)
- Platform takes 0% fee (or minimal 1% for sustainability)
- Tip amounts: preset buttons (0.001, 0.005, 0.01, 0.1 ETH)

---

## 7. WALLET AUTH FLOW

```
1. User clicks "Connect Wallet"
2. ConnectKit modal → MetaMask/Coinbase/WalletConnect
3. Wallet connects to Base network
4. SIWE challenge: sign message proving ownership
5. Session created (JWT with wallet address)
6. User can now rate, comment, tip
7. Read-only access without wallet (can browse feed/leaderboard)
```

---

## 8. RSS FEED SOURCES (Initial)

### Default Feeds
```
- Reuters: https://feeds.reuters.com/reuters/topNews
- BBC: http://feeds.bbci.co.uk/news/rss.xml
- TechCrunch: https://techcrunch.com/feed/
- Hacker News: https://hnrss.org/frontpage
- CoinDesk: https://www.coindesk.com/arc/outboundfeeds/rss/
- The Block: https://www.theblock.co/rss.xml
- Decrypt: https://decrypt.co/feed
- Ars Technica: https://feeds.arstechnica.com/arstechnica/index
```

### User-Submitted Feeds
- Any user can submit an RSS feed URL
- Community votes determine if it gets added to default list
- Custom feed collections per user

---

## 9. AI RATING SYSTEM

Each entity gets an AI-generated credibility/quality score:

**For Domains/Sites:**
- Fact-checking history
- Source reliability
- Bias detection
- Content quality patterns

**For Content/URLs:**
- Sentiment analysis
- Clickbait detection
- Source attribution quality
- Information density

**For Addresses/Contracts:**
- Transaction pattern analysis
- Known scam database check
- Contract audit status
- Community reports correlation

---

## 10. DOMAIN/CONTENT OWNERSHIP VERIFICATION

Creators can claim ownership to receive tips directly:

1. **DNS TXT Record** — Add `morality-verify=0xYourAddress` to DNS
2. **ENS Resolution** — Domain linked via ENS records
3. **Meta Tag** — `<meta name="morality-address" content="0x...">` in page HTML
4. **Smart Contract** — Contract deployer automatically recognized

Unverified entities accumulate tips in escrow → claimable upon verification.

---

## 11. DATA FLOW

```
RSS Sources ──► Fetch & Parse ──► Normalize ──► Store in DB ──► Display in Feed
                                      │
                                      ▼
                              AI Scoring Pipeline
                              (quality, credibility,
                               sentiment, bias)
                                      │
                                      ▼
                              Store AI scores ──► Display on Leaderboard

User Actions ──► Smart Contract Calls ──► Base L2 ──► Event Indexer ──► Update DB Cache
(rate/comment/tip)                                          │
                                                            ▼
                                                    Leaderboard recalc
```

---

## 12. DATABASE SCHEMA (PostgreSQL — Caching Layer)

```sql
-- Cached entities from onchain
entities (
  id, entity_hash, entity_type, identifier,
  avg_rating, rating_count, tip_total,
  comment_count, ai_score, owner_address,
  created_at, updated_at
)

-- Cached ratings from onchain events
ratings (
  id, entity_hash, rater_address, score,
  tx_hash, block_number, created_at
)

-- Cached comments (content from IPFS/onchain)
comments (
  id, entity_hash, author_address, content,
  parent_id, upvotes, downvotes,
  tx_hash, block_number, created_at
)

-- Cached tips from onchain events
tips (
  id, entity_hash, tipper_address, recipient_address,
  amount_wei, tx_hash, block_number, created_at
)

-- RSS feed sources
feed_sources (
  id, url, name, category, is_active,
  last_fetched, fetch_interval_minutes,
  submitted_by_address, vote_count
)

-- RSS feed items (cached)
feed_items (
  id, feed_source_id, entity_hash, title,
  link, description, pub_date, image_url,
  ai_score, created_at
)

-- User sessions
sessions (
  id, wallet_address, siwe_nonce, jwt_token,
  expires_at, created_at
)
```

---

## 13. PROJECT STRUCTURE

```
morality-network-v2/
├── apps/
│   └── web/                          # Next.js 14 app
│       ├── app/
│       │   ├── layout.tsx            # Root layout + providers
│       │   ├── page.tsx              # Home → Feed tab default
│       │   ├── feed/
│       │   │   └── page.tsx          # Feed tab
│       │   ├── leaderboard/
│       │   │   └── page.tsx          # Leaderboard tab
│       │   ├── entity/
│       │   │   └── [hash]/
│       │   │       └── page.tsx      # Entity profile page
│       │   └── api/
│       │       ├── auth/
│       │       │   ├── nonce/route.ts
│       │       │   ├── verify/route.ts
│       │       │   └── session/route.ts
│       │       ├── feed/
│       │       │   ├── route.ts      # GET feed items
│       │       │   └── sources/route.ts
│       │       ├── entity/
│       │       │   └── [hash]/route.ts
│       │       ├── ai/
│       │       │   └── score/route.ts
│       │       └── indexer/
│       │           └── webhook/route.ts
│       ├── components/
│       │   ├── layout/
│       │   │   ├── Header.tsx
│       │   │   ├── TabNav.tsx
│       │   │   └── WalletButton.tsx
│       │   ├── feed/
│       │   │   ├── FeedList.tsx
│       │   │   ├── FeedItem.tsx
│       │   │   └── FeedFilters.tsx
│       │   ├── leaderboard/
│       │   │   ├── LeaderboardTable.tsx
│       │   │   ├── EntityRow.tsx
│       │   │   └── LeaderboardFilters.tsx
│       │   ├── entity/
│       │   │   ├── EntityProfile.tsx
│       │   │   ├── RatingWidget.tsx
│       │   │   ├── CommentThread.tsx
│       │   │   └── TipButton.tsx
│       │   └── shared/
│       │       ├── StarRating.tsx
│       │       ├── AddressDisplay.tsx
│       │       └── EntityBadge.tsx
│       ├── hooks/
│       │   ├── useRating.ts
│       │   ├── useComments.ts
│       │   ├── useTipping.ts
│       │   ├── useEntity.ts
│       │   └── useLeaderboard.ts
│       ├── lib/
│       │   ├── contracts.ts          # ABI + addresses
│       │   ├── rss.ts                # RSS fetching/parsing
│       │   ├── ai-scoring.ts         # AI rating integration
│       │   ├── entity.ts             # Entity hash utilities
│       │   └── db.ts                 # Prisma client
│       └── providers/
│           ├── WagmiProvider.tsx
│           └── AuthProvider.tsx
├── contracts/                        # Foundry project
│   ├── src/
│   │   ├── MoralityRegistry.sol
│   │   ├── MoralityRatings.sol
│   │   ├── MoralityComments.sol
│   │   ├── MoralityTipping.sol
│   │   └── MoralityLeaderboard.sol
│   ├── test/
│   ├── script/
│   └── foundry.toml
├── prisma/
│   └── schema.prisma
├── package.json
└── README.md
```

---

## 14. MVP SCOPE (Phase 1)

**Must Have:**
- [ ] Wallet connect + SIWE auth
- [ ] RSS feed aggregation (8+ default sources)
- [ ] Feed tab with sorted/filterable content
- [ ] Onchain rating (1-5 stars) per entity
- [ ] Onchain commenting (threaded)
- [ ] ETH tipping on Base
- [ ] Basic leaderboard (top rated entities)
- [ ] Entity profile pages

**Nice to Have (Phase 2):**
- [ ] AI scoring pipeline
- [ ] Domain ownership verification
- [ ] User-submitted RSS feeds
- [ ] Chrome extension (port from v1)
- [ ] ENS integration
- [ ] Tip escrow for unclaimed entities
- [ ] Custom feed collections
- [ ] Notification system

**Future (Phase 3):**
- [ ] Mobile app (React Native)
- [ ] Governance token
- [ ] DAO for feed curation
- [ ] Cross-chain support
- [ ] API for third-party integrations

---

## 15. LEGACY CODE REFERENCE

The existing codebase at `/morality.network-master/` contains:
- **Smart Contracts** — Solidity 0.5.x/0.8.x rating + content storage contracts (port patterns to Base)
- **Rating Models** — 5-field rating structure (simplify to single score for v2)
- **Comment System** — Threaded comments with upvotes (port logic)
- **Wallet Integration** — Nethereum patterns (replace with wagmi/viem)
- **Chrome Extension** — Content script injection patterns (reuse in Phase 2)
- **Backend Architecture** — Repository + Service pattern (simplify to API routes)

Key contracts to reference:
- `ratings-main/Contracts/SiteRatings.sol` — Site rating storage pattern
- `ratings-main/Contracts/UserRatings.sol` — User rating aggregation
- `morality.network.contracts-master/Deployable/MoralityContentStorage.sol` — Onchain content storage
- `morality.network.contracts-master/Deployable/MoralityToken.sol` — ERC-20 token patterns

---

## 16. KEY PRINCIPLES

1. **Permissionless** — No accounts, no emails, no gatekeepers. Wallet = identity.
2. **Censorship Resistant** — All ratings, comments, and tips stored onchain. Nobody can delete them.
3. **Direct Value** — Tips go directly to creators. No platform cut (or minimal 1%).
4. **Universal** — Works for any URL, domain, ETH address, or smart contract.
5. **Cheap** — Base L2 makes every interaction cost fractions of a cent.
6. **Open** — All data is onchain and publicly verifiable. No black box algorithms.
