# Deployments

## Launch Runtime Topology

- Web: `web` on Vercel or equivalent
- Indexer API + Postgres: `indexer`
- Always-on worker: `web` via `npm run worker:start`
- Extension: deferred from the first-wave launch path

Runtime mode flags:

- `AGENT_RUNTIME_MODE=worker`
- `TRADER_EXECUTION_MODE=worker`
- `INDEXER_BACKEND_URL=<indexer-url>`
- `INDEXER_WORKER_SECRET=<shared-write-secret>`
- `CRON_SECRET=<shared-service-secret>`
- `SESSION_SECRET=<long-random-session-secret>`
- `OPERATOR_ADDRESSES=<comma-separated-operator-wallets>`
- `TERMINAL_FULL_ACCESS_MIN_MO=100000` (default holder gate for full terminal access)

## Base Sepolia (Chain ID: 84532)

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

## Where Config Is Read

- Extension currently points to deployed Base Sepolia addresses in:
  - `extension/src/shared/contracts.ts`
- Web uses env-overridable addresses in:
  - `web/src/lib/contracts.ts`

## Explorer Links

Use Base Sepolia explorer format:

`https://sepolia.basescan.org/address/<CONTRACT_ADDRESS>`

Example:

`https://sepolia.basescan.org/address/0x14a361454edcb477644eb82bf540a26e1cead72a`

## Notes

- `MoralityRatings` includes `rateWithReason` + `getRatingReason`.
- `MoralityComments.addTipToComment` is restricted to the tipping contract.
- `MoralityRegistry.claimOwnership` requires owner approval workflow.
