# Deployments

Last updated: 2026-07-16 (chain status re-verified onchain; runtime topology still as of 2026-04-03).

## Launch Runtime Topology

| Service | Platform | URL | Current Railway Target |
|---------|----------|-----|------------------------|
| Web (prod) | Railway behind Cloudflare | https://pooter.world | `faithful-purpose / production / morality-network` |
| Web (dev) | Railway behind Cloudflare | https://dev.pooter.world | `earnest-love / dev / morality-network` |
| Background worker | Railway | internal / non-user-facing | `faithful-purpose / production / disciplined-serenity` |
| Indexer API | Railway | https://pooter-indexer-production.up.railway.app | `pooter-indexer / production / pooter-indexer` |
| Agent Hub | Railway | https://heartfelt-flow-production-d872.up.railway.app | `heartfelt-flow / production / heartfelt-flow` |
| Polypooter | Railway | https://polypooter-production.up.railway.app | `earnest-love / production / polypooter` |
| Extension | Chrome Web Store | Deferred | n/a |

### Auxiliary And Cleanup Candidates

These services were observed during the April 1, 2026 audit and are part of the current Railway estate, but they should not be treated as the canonical prod stack unless explicitly re-designated.

| Service | Observed role | Current disposition |
|---------|---------------|---------------------|
| `earnest-love / production / morality-network` | Older Railway frontend | Legacy candidate; not the current public prod host |
| `pooter-indexer / production / pooter-worker` | Overlapping worker activity | Cleanup candidate |
| `pooter-indexer / production / pooter-agent-worker` | Overlapping agent/trader worker activity | Cleanup candidate |
| `pooter-indexer / production / pooter1` | Feature-specific agent/editorial service | Keep only if intentionally owned |
| `faithful-purpose / production / radiant-liberation` | Unhealthy duplicate `pooter1`-style service | Cleanup candidate |
| `spirited-flexibility` | `noun.wtf` infrastructure | Out of scope for `pooter.world` |

### Public DNS (updated 2026-04-01)

- Authoritative nameservers: `annalise.ns.cloudflare.com`, `melnicoff.ns.cloudflare.com`
- `pooter.world` CNAME → `oewwxjq0.up.railway.app` (faithful-purpose, DNS only)
- `dev.pooter.world` CNAME → `svb92msz.up.railway.app` (earnest-love, DNS only — currently serving)

### Deploy Commands

```bash
# Production auto-deploys from GitHub main via faithful-purpose.
# To manually deploy to production:
railway link -p faithful-purpose -e production -s morality-network && railway up --detach

# Always re-link after manual deploy:
railway link -p faithful-purpose -e production -s morality-network

# Dev target:
# railway link -p earnest-love -e dev -s morality-network
# Use dev as the staging environment before promoting to main.

# Deploy indexer
railway link -p pooter-indexer -e production -s pooter-indexer && railway up --detach
```

## Current Chain Status

> **Core contracts are LIVE on Base mainnet.** Verified 2026-07-16 by `eth_getCode`
> against `https://mainnet.base.org` — bytecode present at every address in the Base
> Mainnet table below. The web app's defaults in `web/src/lib/contracts.ts` point at
> these mainnet proxies, and that is correct.
>
> Genuinely **not** deployed on any network:
> - The **vault rail** (10 contracts). `DeployVaultRail{Base,Arb}.s.sol` exist but have
>   no broadcast artifact on any chain — the scripts have never been run.
> - `MoralityProposalVoting` (requires `NOUNS_TOKEN`), `MembershipRegistry`,
>   `PrivateBallot`, and `circuits/vote/vote.circom` (no proving setup).

> ⚠️ **Addresses collide across chains. Always pin the chain id.**
> The same deployer at the same nonce produces the **same CREATE address on Base mainnet
> and Base Sepolia, holding different contracts**. An address alone is not an identifier here:
>
> | Address | On Base Sepolia (84532) | On Base mainnet (8453) |
> |---|---|---|
> | `0x661674e3…` | MoralityRegistry | **PooterEditions** (impl) |
> | `0x527e2D6A…` | MoralityRatings | **PooterAuctions** |
> | `0x2ea7502C…` | — | MoralityRegistry proxy — *and the L1 prediction market proxy on Ethereum* |
>
> This is why this file previously claimed "testnet only, mainnet pending": the Sepolia
> addresses resolve to live mainnet contracts, so a spot-check looks like it confirms the
> claim. **Verify with `eth_getCode` against a named RPC, or check for a broadcast artifact
> at `contracts/broadcast/<script>/<chainid>/run-latest.json` — the presence of that
> directory is what proves a script actually ran on that chain.** Do not trust one public
> RPC either: `eth.llamarpc.com` returned `521` during this audit, which reads as
> "no code" and produces false negatives. Cross-check on a second endpoint.

### Verification one-liner

```bash
# Substitute the chain's RPC. Result "0x" = no contract; anything longer = deployed.
curl -s -X POST https://mainnet.base.org -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_getCode","params":["<ADDRESS>","latest"]}'
```

Runtime mode flags:

- `AGENT_RUNTIME_MODE=worker`
- `TRADER_EXECUTION_MODE=worker`
- `INDEXER_BACKEND_URL=<indexer-url>`
- `INDEXER_WORKER_SECRET=<shared-write-secret>`
- `CRON_SECRET=<shared-service-secret>`
- `SESSION_SECRET=<long-random-session-secret>`
- `OPERATOR_ADDRESSES=<comma-separated-operator-wallets>`
- `TERMINAL_FULL_ACCESS_MIN_MO=100000` (default holder gate for full terminal access)

## Release Workflow

Canonical flow going forward:

1. Start from `dev` or a feature branch off `dev`
2. Push tested changes to `origin/dev`
3. Validate on `https://dev.pooter.world`
4. Fast-forward `main` from `dev`
5. Let production deploy from `main`

Avoid direct production CLI deploys from a dirty local workspace unless there is an explicit incident response reason.

## Base Mainnet (Chain ID: 8453) — PRODUCTION

All verified onchain 2026-07-16. These are the addresses production actually uses, and they
match the hardcoded fallbacks in `web/src/lib/contracts.ts`.

Deploy artifacts:
- `contracts/broadcast/DeployAll.s.sol/8453/run-latest.json`
- `contracts/broadcast/DeployAuctions.s.sol/8453/run-latest.json`
- `contracts/broadcast/DeployLedgerAnchor.s.sol/8453/run-latest.json`

| Contract | Proxy (use this) | Implementation |
|---|---|---|
| MoralityRegistry | `0x2ea7502C4db5B8cfB329d8a9866EB6705b036608` | `0x68d72ee14cb657f17ba4a1e23c77444b1fbd677e` |
| MoralityRatings | `0x29F66D8b15326cE7232c0277DBc2CbFDaaf93405` | `0xb61be51e8aed1360eaa03eb673f74d66ec4898d7` |
| MoralityComments | `0x66BA3cE1280bF86DFe957B52e9888A1De7F81d7b` | `0x622cd30124e24dffe77c29921bd7622e30d57f8b` |
| MoralityTipping | `0x27c79A57BE68EB62c9C6bB19875dB76D33FD099B` | `0x57dc0c9833a124fe39193dc6a554e0ff37606202` |
| MoralityLeaderboard | `0x29f0235d74E09536f0b7dF9C6529De17B8aF5Fc6` | `0x1c73efffeb89ad8699770921dbd860bb5da5b15a` |
| MoralityPredictionMarket | `0x71b2e273727385c617fe254f4fb14a36a679b12a` | `0x14a361454edcb477644eb82bf540a26e1cead72a` |
| MoralityAgentVault | `0x4b48d35e019129bb5a16920adc4cb7f445ec8ca5` | `0xf5bc0775ce478df8477781017d67809d663d9995` |
| PooterEditions | `0x06d7c7d70c685d58686FF6E0b0DB388209fCCC6e` | `0x98855cc7c85d563194d8e42b57d9cf35d5446286` |
| PooterAuctions | `0x527e2D6Ae259E3531e4d38A5f634Fd1F788Fc71f` | *(non-proxy)* |
| MO token (ERC20) | `0x8729c70061739140ee6bE00A3875Cbf6d09A746C` | *(non-proxy)* |
| LedgerAnchor | `0x1A55c83fb85D5d5Ab9415b016a47A56C0a54B99d` | *(non-upgradeable by design)* |

`PooterAuctions` came from `DeployAuctions.s.sol`, which also deployed a second
`PooterEditions` implementation at `0x661674e3bf03b644a755c0438e3f2168a4d6aa13` — note this
is the address that is `MoralityRegistry` on Sepolia. See the collision warning above.

LedgerAnchor operator: `0xd634Aada5b43FB1cFfBb67A6b635B2a8eB492933` (key in
`LEDGER_ANCHOR_PRIVATE_KEY` on the prod web service).

## Ethereum Mainnet (Chain ID: 1)

Deploy artifact: `contracts/broadcast/DeployPredictionMarketL1.s.sol/1/run-latest.json`

| Contract | Proxy | Implementation |
|---|---|---|
| MoralityPredictionMarket | `0x2ea7502c4db5b8cfb329d8a9866eb6705b036608` | `0x68d72ee14cb657f17ba4a1e23c77444b1fbd677e` |

Verified live 2026-07-16 via `ethereum-rpc.publicnode.com` (ERC1967 proxy bytecode present).
Note this proxy address is identical to the **Base** `MoralityRegistry` proxy, and its
implementation address is identical to the **Base** `MoralityRegistry` implementation —
different chains, different contracts, same addresses.

## Base Sepolia (Chain ID: 84532) — TESTNET

All 9 verified live on Sepolia 2026-07-16. **These are testnet twins, not the production
stack** — do not read this table as the deploy state of the product.

Latest deploy artifact: `contracts/broadcast/DeployAll.s.sol/84532/run-latest.json`
Deployment script: `contracts/script/DeployAll.s.sol`

| Contract | Address |
|---|---|
| MoralityRegistry | `0x661674e3Bf03B644a755c0438E3F2168a4d6aa13` |
| MoralityRatings | `0x527e2D6Ae259E3531e4d38A5f634Fd1F788Fc71f` |
| MoralityComments | `0xd17E13507f8005048a3fcf9850F2dF65c56e3005` |
| MoralityTipping | `0x8b632dF91E59Fb14C828E65E3e1f6eea2180721e` |
| MoralityLeaderboard | `0xf7294B25396E77Fcf6af3f38A3116737df229080` |
| MoralityPredictionMarket | `0x57bB5C8a19385bCBD366EEcDCFDfA59f47744058` |
| MoralityAgentVault | `0x781A6904a00b8B1a03ba358011A9BF9720eeC531` |
| PooterEditions | `0x7Ec524d8804cA86562F6892de58CCDc22260CA42` |
| PooterAuctions | `0xe1D407E486b5943d773FAC9A145a5308b14cC225` |
| MoralityProposalVoting | Not deployed (requires `NOUNS_TOKEN`) |

### Auctions + Community Editions

`DeployAll.s.sol` does not deploy `PooterAuctions`. To get the full editions stack on
Base Sepolia, run `contracts/script/DeployAuctions.s.sol` after `PooterEditions` exists and
set `POOTER_EDITIONS_PROXY` plus `TREASURY`.

### Dev Site Wiring

To point `dev.pooter.world` at Base Sepolia without touching production defaults, set:

- `NEXT_PUBLIC_CONTRACTS_CHAIN_ID=84532`
- `NEXT_PUBLIC_AGENT_VAULT_CHAIN_ID=84532`
- `NEXT_PUBLIC_PREDICTION_MARKET_CHAIN_ID=84532`
- `NEXT_PUBLIC_REGISTRY_ADDRESS=<Base Sepolia registry>`
- `NEXT_PUBLIC_RATINGS_ADDRESS=<Base Sepolia ratings>`
- `NEXT_PUBLIC_COMMENTS_ADDRESS=<Base Sepolia comments>`
- `NEXT_PUBLIC_TIPPING_ADDRESS=<Base Sepolia tipping>`
- `NEXT_PUBLIC_LEADERBOARD_ADDRESS=<Base Sepolia leaderboard>`
- `NEXT_PUBLIC_AGENT_VAULT_ADDRESS=<Base Sepolia vault>`
- `NEXT_PUBLIC_POOTER_EDITIONS_ADDRESS=<Base Sepolia editions>`
- `NEXT_PUBLIC_POOTER_AUCTIONS_ADDRESS=<Base Sepolia auctions>`
- `NEXT_PUBLIC_PREDICTION_MARKET_ADDRESS=<Base Sepolia prediction market>`

Optional, depending on what you deploy for governance testing:

- `NEXT_PUBLIC_PROPOSAL_VOTING_ADDRESS=<Base Sepolia proposal voting>`
- `NEXT_PUBLIC_NOUNS_TOKEN_ADDRESS=<test token or mock nouns token>`
- `NEXT_PUBLIC_MO_TOKEN_ADDRESS=<test MO token if holder-gating on Sepolia>`

If you do not deploy a testnet `NOUNS_TOKEN`, keep `PROPOSAL_VOTING` disabled on dev or use a
mock token strictly for UI/integration testing.

## Vault Rail Testnet Rollout

> **Status: NOT DEPLOYED on any network, including testnet.** Neither
> `DeployVaultRailBase.s.sol` nor `DeployVaultRailArb.s.sol` has a broadcast artifact under
> `contracts/broadcast/`, which means neither script has ever been run. `SECURITY_AUDIT.md`
> flags 4 CRITICAL custody issues in this rail — resolve those before any deploy.
> The `/vault` page is a **static explainer only**: no wallet connection, no deposit path,
> it takes no funds. Everything below is a plan, not a record.

The Base -> Arbitrum -> Hyperliquid vault rail is *designed* as two coordinated stacks:

- Base side: `contracts/script/DeployVaultRailBase.s.sol`
- Arbitrum side: `contracts/script/DeployVaultRailArb.s.sol`

Deploy the Arbitrum side first so the Base router can be pointed at a live escrow/manager pair.

### Base-side Contracts

- `BaseCapitalVault`
- `WithdrawalQueue`
- `MorphoReserveAllocator`
- `BridgeRouter`
- `NavReporter`
- `ExecutorAssetConverter`
- `ExecutorBridgeAdapter`

### Arbitrum-side Contracts

- `ArbTransitEscrow`
- `HLStrategyManager`

### Required Foundry Env

- `VAULT_RAIL_OWNER`
- `VAULT_RAIL_WETH`
- `VAULT_RAIL_BASE_BRIDGE_ASSET`
- `VAULT_RAIL_ARB_BRIDGE_ASSET`
- `VAULT_RAIL_MORPHO_TARGET`
- `VAULT_RAIL_ROUTER_OPERATOR`
- `VAULT_RAIL_BRIDGE_EXECUTOR`
- `VAULT_RAIL_REPORTER`
- `VAULT_RAIL_HL_OPERATOR`
- `VAULT_RAIL_STRATEGY_WALLET`
- `VAULT_RAIL_BRIDGE_ASSET_LP`
- `VAULT_RAIL_VAULT_ASSET_LP`
- `VAULT_RAIL_ASSET_IN_SINK`
- `VAULT_RAIL_BRIDGE_ASSET_SINK`
- `VAULT_RAIL_TO_BRIDGE_RATE_E18`
- `VAULT_RAIL_TO_VAULT_RATE_E18`

Optional:

- `VAULT_RAIL_BRIDGE_ASSET`
- `VAULT_RAIL_ARB_ESCROW`
- `VAULT_RAIL_DEPOSIT_CAP`
- `VAULT_RAIL_MIN_LIQUID_BPS`
- `VAULT_RAIL_RESERVE_TARGET_BPS`
- `VAULT_RAIL_HL_TARGET_BPS`
- `VAULT_RAIL_PERFORMANCE_FEE_BPS`
- `VAULT_RAIL_DEPLOY_DEV_RESERVE=true`
- `VAULT_RAIL_DEPLOY_DEV_BRIDGE_ASSET=true`

### Worker / App Env

To wire the keeper/service layer after the contracts are deployed, set:

- `TRADER_VAULT_RAIL_ENABLED=true`
- `TRADER_VAULT_RAIL_BASE_VAULT_ADDRESS=<BaseCapitalVault>`
- `TRADER_VAULT_RAIL_RESERVE_ALLOCATOR_ADDRESS=<MorphoReserveAllocator>`
- `TRADER_VAULT_RAIL_BRIDGE_ROUTER_ADDRESS=<BridgeRouter>`
- `TRADER_VAULT_RAIL_NAV_REPORTER_ADDRESS=<NavReporter>`
- `TRADER_VAULT_RAIL_ASSET_CONVERTER_ADDRESS=<ExecutorAssetConverter>`
- `TRADER_VAULT_RAIL_BRIDGE_ADAPTER_ADDRESS=<ExecutorBridgeAdapter>`
- `TRADER_VAULT_RAIL_ARB_TRANSIT_ESCROW_ADDRESS=<ArbTransitEscrow>`
- `TRADER_VAULT_RAIL_HL_STRATEGY_MANAGER_ADDRESS=<HLStrategyManager>`
- `TRADER_VAULT_RAIL_BASE_BRIDGE_ASSET_ADDRESS=<Base bridge asset>`
- `TRADER_VAULT_RAIL_ARB_BRIDGE_ASSET_ADDRESS=<Arbitrum bridge asset>`
- `TRADER_VAULT_RAIL_BASE_CHAIN_ID=<84532 or 8453>`
- `TRADER_VAULT_RAIL_BASE_RPC_URL=<Base RPC>`
- `TRADER_VAULT_RAIL_ARB_CHAIN_ID=<421614 or 42161>`
- `TRADER_VAULT_RAIL_ARB_RPC_URL=<Arbitrum RPC>`
- `TRADER_VAULT_RAIL_AUTO_REPORT_NAV=true`
- `TRADER_VAULT_RAIL_MIN_NAV_INTERVAL_MS=86400000`
- `TRADER_VAULT_RAIL_NAV_FEE_ETH=0`

If you run a separate Base parallel sleeve, the same keys can be set with the
`TRADER_BASE_PARALLEL_` prefix.

For pure dev/testnet rollouts, the Foundry scripts can deploy:

- `DevReserveVault` when `VAULT_RAIL_MORPHO_TARGET` is omitted or `VAULT_RAIL_DEPLOY_DEV_RESERVE=true`
- `DevUSDC` when bridge-asset envs are omitted or `VAULT_RAIL_DEPLOY_DEV_BRIDGE_ASSET=true`

## Where Config Is Read

- Web uses env-overridable addresses in `web/src/lib/contracts.ts`. Every address is read
  from a `NEXT_PUBLIC_*` env var with a **Base mainnet** hardcoded fallback — so this file
  cannot tell you what a given environment resolves to. To know what prod actually points
  at, read the Railway env vars for `faithful-purpose / production / morality-network`.
- Extension (0.2.0+) defaults to **Base mainnet** with Base Sepolia selectable in its
  settings. Per-network addresses are pinned by chain id in
  `extension/src/shared/constants.ts` (NETWORKS) — never copy an address between the two
  network blocks without verifying it onchain against the target chain id.

## Cron Schedule

**The scheduler of record is GitHub Actions: `.github/workflows/crons.yml`.** One workflow
carries all 11 `schedule:` entries and maps each cron expression to a route in a `case`
statement. That file is authoritative — this table is a mirror of it (synced 2026-07-16),
and no Vercel scheduler file should be treated as live.

| Cron (UTC) | Endpoint | Purpose |
|---|---|---|
| `0 3 * * 1,4` | `/api/moral-compass/crawl` | Crawl ethics/philosophy sources (Mon + Thu) |
| `0 4 * * *` | `/api/moral-commentary/generate` | Generate moral commentary |
| `30 5 * * *` | `/api/cron/daily-edition` | Generate daily edition |
| `45 5 * * *` | `/api/cron/daily-illustration` | Cover art |
| `0 6 * * *` | `/api/newsroom` | Pooter Originals (GET) |
| `10 6 * * *` | `/api/cron/ledger-anchor` | Publish daily Claim Ledger Merkle root onchain |
| `15 7 * * *` | `/api/newsletter/send` | Send newsletter (POST) |
| `0 14 * * 3` | `/api/cron/ledger-pmqs` | Ingest PMQs from Hansard (Wed) |
| `0 15 * * 3` | `/api/cron/ledger-resolve` | Resolve claims → verdicts (Wed) |
| `30 16 * * *` | `/api/cron/ledger-backfill` | Backfill historical claims |
| `30 17 * * *` | `/api/cron/ledger-manifesto` | Manifesto corpus ingest |

Unmatched schedules fall through to `/api/cron/daily-edition`, so **adding a `schedule:`
entry without adding a matching `case` silently double-runs the daily edition.**

Note `/api/editorial/pregenerate` was listed here historically but is **not** wired to any
cron in `crons.yml`.

## Explorer Links

- **Base Sepolia:** `https://sepolia.basescan.org/address/<ADDRESS>`
- **Base Mainnet:** `https://basescan.org/address/<ADDRESS>`

## Notes

- `MoralityRatings` includes `rateWithReason` + `getRatingReason`.
- `MoralityComments.addTipToComment` is restricted to the tipping contract.
- `MoralityRegistry.claimOwnership` requires owner approval workflow.
