# Launch Hardening

This document captures the current launch stance after the hardening pass across `web`, `indexer`, and `contracts`.

## Implemented In Repo

- Secret-bearing local env files were replaced with placeholders and checked-in examples:
  - `web/.env.example`
  - `contracts/.env.example`
- Governance and market-data fetches now use shared in-process TTL caching to reduce repeat fan-out to Snapshot, Tally, parliaments, CoinGecko, and adjacent vendors.
- The indexer now exposes durable worker-state endpoints:
  - `GET/POST /api/v1/swarm/latest`
  - `GET/POST /api/v1/trading/state`
- The web app supports worker-owned runtime modes:
  - `AGENT_RUNTIME_MODE=worker`
  - `TRADER_EXECUTION_MODE=worker`
- A standalone always-on worker is available under `web`:
  - build: `npm run worker:build`
  - run: `npm run worker:start`
  - one-shot validation: `npm run worker:once`

## Production Topology

### Launch-critical

- `web`: public Next.js surface on Vercel or equivalent
- `indexer`: Ponder API + persistent Postgres
- `web` worker process: scanner sync, swarm refresh, optional trader execution
- Base mainnet contracts and addresses aligned across web + indexer

### Deferred from wave one

- `extension`
- local in-process agent message bus as an operational dependency
- paid dedicated RPC
- experimental telemetry or non-essential bot surfaces

## Worker Deployment

Run the worker as a small always-on Node process, not inside Vercel request handlers.

Recommended environment:

```bash
INDEXER_BACKEND_URL=https://<indexer-host>
INDEXER_WORKER_SECRET=<shared-write-secret>
CRON_SECRET=<shared-service-secret>
SESSION_SECRET=<long-random-session-secret>
OPERATOR_ADDRESSES=0xabc...,0xdef...
AGENT_RUNTIME_MODE=worker
TRADER_EXECUTION_MODE=worker
WORKER_TASKS=scanner,swarm
# Add trader only when funded, keyed, and explicitly enabled:
# WORKER_TASKS=scanner,swarm,trader
# Optional: change the holder gate for terminal access (defaults to 100000 MO)
# TERMINAL_FULL_ACCESS_MIN_MO=100000
```

Key intervals:

- `WORKER_SCANNER_INTERVAL_MS` default `180000`
- `WORKER_SWARM_INTERVAL_MS` default `300000`
- `WORKER_TRADER_INTERVAL_MS` default `120000`

## Secret Rotation

Repo-side changes only remove live values from local files. Actual rotation still requires vendor consoles and funded wallets.

Required operator actions:

1. Create a new `SESSION_SECRET`.
2. Rotate `ANTHROPIC_API_KEY`.
3. Rotate `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` if the prior value was shared too broadly.
4. Create a new deployer key, fund it minimally, and update `contracts/.env`.
5. Set `INDEXER_WORKER_SECRET` for worker writes into the indexer.
6. Set `CRON_SECRET` for cron and service-to-service mutation routes.
7. Set `OPERATOR_ADDRESSES` and/or `GOD_MODE_ADDRESSES` so operator dashboards work through SIWE without falling back to bearer secrets.

## Paid RPC Decision

Current decision: stay on public RPC for launch unless a measured bottleneck appears.

Rationale:

- Base explicitly documents free, rate-limited endpoints and multiple third-party providers for Base Mainnet and Base Sepolia:
  [Base node providers](https://docs.base.org/base-chain/node-providers)
- Alchemy documents a free tier up to `30M` compute units per month and pay-as-you-go starting at `$0.45` per million compute units:
  [Alchemy pay-as-you-go pricing FAQ](https://www.alchemy.com/docs/reference/new-pricing-for-existing-scale-and-growth-customers)
- QuickNode documents Base-compatible flat-rate RPS for steady traffic, but the first EVM flat-rate tier starts at `75 RPS` for `$799/month`, which is excessive for initial launch traffic:
  [QuickNode flat-rate RPS](https://www.quicknode.com/docs/platform/billing/flat-rate-rps)

Adopt paid RPC when any one of these becomes true:

1. The indexer or worker records repeated rate-limit or availability failures from public RPC on `3+` distinct occasions in a rolling 7-day window.
2. Indexer sync falls materially behind head more than twice in 24 hours because the public provider cannot serve logs reliably.
3. Trader execution or contract reads see sustained RPC error rates above `1%` over a 24-hour period.
4. Forecast usage exceeds the free-tier envelope and a metered provider is cheaper than staff time spent handling instability.
5. You need predictable single-chain throughput in the `75 RPS+` class, at which point flat-rate products become relevant.

Recommendation order:

1. First paid step: metered provider such as Alchemy or another Base-listed pay-as-you-go vendor.
2. Only move to fixed-RPS products when traffic is steady enough that predictability matters more than flexibility.
3. Do not buy dedicated or flat-rate RPC for launch-day optics alone.

## Extension Scope Decision

Decision: the Chrome extension is deferred from the first-wave launch.

Reasoning:

- The web app, contracts, indexer, and worker now form a complete launch path.
- The extension adds browser-runtime QA, review, and support burden without being required for settlement, reputation, editorial, governance, or scanner workflows.
- Keeping it out of the funded critical path lowers operational complexity for the co-operative.

Revisit the extension only after:

- the web launch path is stable for at least one operating cycle,
- worker + indexer uptime is acceptable,
- members actively request inline browsing overlays as a priority workflow.
