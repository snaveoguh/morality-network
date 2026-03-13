# pooter world Indexer

Event indexer and API server for onchain activity.

## What It Does

- Ingests contract events from Base mainnet by default.
- Normalizes into query tables:
  - `entity`
  - `rating`
  - `comment`
  - `tip`
  - `feed_item`
  - `comment_vote`
  - `scanner_launch`
  - `article_archive`
  - `editorial_archive`
  - `swarm_state`
  - `trader_state`
- Exposes public API endpoints for feed/entity consumption.

## Live API Endpoints

- `GET /api/v1/health`
- `GET /api/v1/entities/:entityHash`
- `GET /api/v1/entities/:entityHash/feed`
- `GET /api/v1/feed/global`
- `GET /api/v1/scanner/launches`
- `GET /api/v1/scanner/launches/:address`
- `POST /api/v1/scanner/sync`
- `GET /api/v1/swarm/latest`
- `POST /api/v1/swarm/latest`
- `GET /api/v1/trading/state`
- `POST /api/v1/trading/state`
- `GET /api/v1/archive/articles`
- `GET /api/v1/archive/articles/:hash`
- `POST /api/v1/archive/articles/upsert`
- `GET /api/v1/archive/editorials/hashes`
- `GET /api/v1/archive/editorials/market-impact`
- `GET /api/v1/archive/editorials/:hash`
- `POST /api/v1/archive/editorials/upsert`
- `POST /api/v1/archive/editorials/:hash/mark-onchain`
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
PONDER_NETWORK=base
PONDER_RPC_URL_1=<base-mainnet-rpc-url>
REGISTRY_ADDRESS=0x2ea7502c4db5b8cfb329d8a9866eb6705b036608
RATINGS_ADDRESS=0x29f66d8b15326ce7232c0277dbc2cbfdaaf93405
COMMENTS_ADDRESS=0x66ba3ce1280bf86dfe957b52e9888a1de7f81d7b
TIPPING_ADDRESS=0x27c79a57be68eb62c9c6bb19875db76d33fd099b
LEADERBOARD_ADDRESS=0x29f0235d74e09536f0b7df9c6529de17b8af5fc6
START_BLOCK=<optional>
INDEXER_WORKER_SECRET=<optional-shared-write-secret>
```

Use `PONDER_NETWORK=baseSepolia` and override addresses if you want staging instead of mainnet.

3. Start Postgres + indexer + healthcheck in one command:

```bash
npm run bootstrap:local
```

Default server port: `42069`

Seed scanner data (optional):

```bash
curl -X POST 'http://localhost:42069/api/v1/scanner/sync?limit=50'
curl 'http://localhost:42069/api/v1/scanner/launches?minScore=50&limit=20'
```

## Utility Scripts

```bash
npm run db:up         # start postgres container
npm run db:down       # stop postgres container
npm run healthcheck   # verify root/health/feed/graphql endpoints
```

## Notes

- `ponder serve` does not support the default PGlite mode in this setup.
- For production, run with persistent DB; keep public RPC for low-traffic launch periods and switch to paid RPC only after rate limits or reliability become measured bottlenecks.
- `INDEXER_BACKEND_URL` in the web app can now be used as the single durable backend for scanner plus archive/editorial persistence.
- `INDEXER_WORKER_SECRET` protects worker-only write endpoints when the indexer is internet-reachable.

## Related Docs

- `v2/docs/API_REFERENCE.md`
- `v2/docs/ARCHITECTURE.md`
- `v2/docs/LAUNCH_HARDENING.md`
- `v2/docs/DELIVERABLES_MASTER.md`
- `v2/docs/RUNBOOK_INDEXER.md`
