# pooter world Indexer

Event indexer and API server for onchain activity.

## What It Does

- Ingests contract events from Base Sepolia.
- Normalizes into query tables:
  - `entity`
  - `rating`
  - `comment`
  - `tip`
  - `feed_item`
  - `comment_vote`
- Exposes public API endpoints for feed/entity consumption.

## Live API Endpoints

- `GET /api/v1/health`
- `GET /api/v1/entities/:entityHash`
- `GET /api/v1/entities/:entityHash/feed`
- `GET /api/v1/feed/global`
- `GET /graphql`

Implementation: `src/api/routes.ts`

## Local Setup

1. Install deps:

```bash
cd v2/indexer
npm install
```

2. Configure env (`.env.local` recommended):

```bash
PONDER_RPC_URL_1=<base-sepolia-rpc-url>
REGISTRY_ADDRESS=0x2ea7502C4db5B8cfB329d8a9866EB6705b036608
RATINGS_ADDRESS=0xb61bE51E8aEd1360EaA03Eb673F74D66eC4898D7
COMMENTS_ADDRESS=0x29F66D8b15326cE7232c0277DBc2CbFDaaf93405
TIPPING_ADDRESS=0x622cD30124e24dFFe77c29921bD7622e30d57F8B
LEADERBOARD_ADDRESS=0x57dc0C9833A124FE39193dC6a554e0Ff37606202
START_BLOCK=<optional>
```

3. Generate and run:

```bash
npm run codegen
npm run dev
```

Default server port: `42069`

## Notes

- `ponder serve` does not support the default PGlite mode in this setup.
- For production, run with persistent DB and non-public high-rate-limit RPC.

## Related Docs

- `v2/docs/API_REFERENCE.md`
- `v2/docs/ARCHITECTURE.md`
- `v2/docs/DELIVERABLES_MASTER.md`
