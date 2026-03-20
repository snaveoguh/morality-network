# pooter world Web

Next.js product surface for feed, proposals, leaderboard, article views, and style guide.

## Main Routes

- `/` feed
- `/proposals`
- `/leaderboard`
- `/article/[hash]`
- `/entity/[hash]`
- `/stumble`
- `/style-guide`

## API Routes (Current)

- `/api/feed`
- `/api/feed/sources`
- `/api/governance`
- `/api/governance/[id]`
- `/api/v1/governance/live`
- `/api/stumble`
- `/api/auth/nonce`
- `/api/auth/verify`
- `/api/auth/session`
- `/api/ai/score`

For indexer-backed APIs, see `v2/indexer` and `v2/docs/API_REFERENCE.md`.

Scanner integration (optional):

- `INDEXER_BACKEND_URL` — preferred durable backend URL for scanner data plus article/editorial archive persistence.
- `SCANNER_BACKEND_URL` — legacy alias still supported for scanner and archive proxying.
- `AGENT_RUNTIME_MODE=worker` — disables local agent bootstrapping and expects persisted worker state in the indexer.
- `TRADER_EXECUTION_MODE=worker` — disables request-time trader execution and expects persisted trader state in the indexer.
- `INDEXER_WORKER_SECRET` — **required** bearer secret for worker writes and memory reads into the indexer. The indexer rejects all protected requests if this is unset.
- `/api/agents/events/stream` — SSE feed on top of the durable `agent_event` log for UI and remote consumers.
- `AGENT_BRIDGE_URL` + `AGENT_BRIDGE_SECRET` — optional remote agent relay target (for example `noun.wtf`).
- `AGENT_BRIDGE_PRIVATE_KEY` — dedicated signer key used to cryptographically sign relayed swarm messages.
- `AGENT_BRIDGE_ALLOWED_SIGNERS` — comma-separated allowlist of trusted remote signer addresses.
- `AGENT_BRIDGE_REQUIRE_SIGNATURE` — reject relayed messages unless they carry a valid trusted signature.
- `AGENT_BRIDGE_MAX_SKEW_MS` — replay-window tolerance for bridge signatures.
- `AGENT_BRIDGE_TOPICS` — comma-separated durable swarm topics forwarded to the remote bridge by the worker.
- `WORKER_BRIDGE_CONSUMER_ID` — durable relay cursor name stored in the indexer.
- `AI_FAST_PROVIDER_ORDER` / `AI_PREMIUM_PROVIDER_ORDER` — provider routing for AI tasks.
- `OPENAI_API_KEY`, `VENICE_API_KEY`, `OLLAMA_BASE_URL` — optional secondary/local inference providers in addition to Anthropic.
- `AI_BUDGET_*` — optional rolling spend caps used to block providers before they exceed budget.
- `AI_PRICE_*_USD_PER_1M` — optional per-provider or per-model token pricing inputs for cost estimation.
- `/api/agents/console` — aggregated swarm console metrics for throughput, bridge lag, trader decisions, and AI telemetry.

## Local Run

```bash
cd v2/web
npm install
npm run dev
```

Worker runtime:

```bash
cd v2/web
npm run worker:start
```

Useful overrides:

- `WORKER_TASKS=scanner,swarm`
- `WORKER_TASKS=scanner,swarm,trader`
- `WORKER_TASKS=scanner,swarm,trader,bridge`
- `WORKER_SCANNER_INTERVAL_MS`
- `WORKER_SWARM_INTERVAL_MS`
- `WORKER_TRADER_INTERVAL_MS`
- `WORKER_BRIDGE_INTERVAL_MS`

## Contract Config

`src/lib/contracts.ts`

Set env vars to override defaults:

- `NEXT_PUBLIC_REGISTRY_ADDRESS`
- `NEXT_PUBLIC_RATINGS_ADDRESS`
- `NEXT_PUBLIC_COMMENTS_ADDRESS`
- `NEXT_PUBLIC_TIPPING_ADDRESS`
- `NEXT_PUBLIC_LEADERBOARD_ADDRESS`
- `NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS`

## Design System

- Source tokens: `src/app/globals.css`
- Dedicated guide page: `/style-guide`
- Guide source: `v2/docs/style-guide.html`

## Related Docs

- `v2/docs/ARCHITECTURE.md`
- `v2/docs/LAUNCH_HARDENING.md`
- `v2/docs/STYLE_GUIDE.md`
- `v2/docs/DELIVERABLES_MASTER.md`
