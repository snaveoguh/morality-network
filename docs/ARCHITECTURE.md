# Architecture

## Monorepo Layout

```text
v2/
  contracts/   # Solidity contracts + Foundry scripts/tests
  extension/   # Chrome extension (content script + popup + background)
  indexer/     # Ponder event indexer (onchain -> queryable tables)
  web/         # Next.js app + API routes + feed UI
```

## System Overview

```text
Browser (web or extension UI)
  -> Wallet (wagmi/viem, Base Sepolia/Base)
  -> Solidity contracts (registry, ratings, comments, tipping, leaderboard, prediction market)
  -> Events emitted onchain
  -> Ponder indexer ingests events into query tables
  -> Public API endpoints expose feed/governance/indexed activity
```

## Contracts Layer (`v2/contracts/src`)

- `MoralityRegistry.sol`: universal entity registration and ownership claim flow.
- `MoralityRatings.sol`: entity ratings, plus `rateWithReason` and reason retrieval.
- `MoralityComments.sol`: threaded comments and voting.
- `MoralityTipping.sol`: entity/comment tipping and escrow withdrawal.
- `MoralityLeaderboard.sol`: composite scoring.
- `MoralityPredictionMarket.sol`: binary prediction markets on proposal outcomes.
- `MoralityProposalVoting.sol`: proposal/voting contract (optional deployment depending on token config).

Deploy script: `v2/contracts/script/DeployAll.s.sol`

## Web App Layer (`v2/web`)

- Framework: Next.js App Router.
- Primary surfaces:
  - Feed (`/`): newspaper-style mixed feed.
  - Proposals (`/proposals`): DAO/government/corporate governance stream.
  - Leaderboard (`/leaderboard`): entity ranking + scoring.
- API routes under `v2/web/src/app/api` provide feed, governance, auth, and AI-score handlers.

## Extension Layer (`v2/extension`)

- `src/content`: page detection/highlight, tooltip, side panel, overlay.
- `src/background`: wallet and contract action handlers.
- `src/popup`: extension popup UI.
- `src/shared`: contracts ABIs, hashing, typing, known entities, RPC helpers.

## Indexer Layer (`v2/indexer`)

- Ponder schema (`ponder.schema.ts`) tracks:
  - `entity`, `rating`, `comment`, `tip`, `feed_item`, `comment_vote`
- Event processors in `src/*.ts` map contract events into denormalized, query-friendly rows.

## Data Boundaries

- Onchain is source of truth for ratings/comments/tips state.
- Indexer is query acceleration and analytics layer.
- Web API routes currently combine indexed data, governance APIs, RSS aggregation, and wallet-auth workflows.

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

- Web contract config: `v2/web/src/lib/contracts.ts`
- Extension contract config: `v2/extension/src/shared/contracts.ts`
- Foundry deploy env: `v2/contracts/.env` (`PRIVATE_KEY`, `BASE_SEPOLIA_RPC_URL`, optional oracle/token addresses)
