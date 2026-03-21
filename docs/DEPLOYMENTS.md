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
| MoralityRegistry | `0x1c73efffeb89ad8699770921dbd860bb5da5b15a` |
| MoralityRatings | `0x29f0235d74e09536f0b7df9c6529de17b8af5fc6` |
| MoralityComments | `0x14a361454edcb477644eb82bf540a26e1cead72a` |
| MoralityTipping | `0x71b2e273727385c617fe254f4fb14a36a679b12a` |
| MoralityLeaderboard | `0x4b48d35e019129bb5a16920adc4cb7f445ec8ca5` |
| MoralityPredictionMarket | `0x98855cc7c85d563194d8e42b57d9cf35d5446286` |
| PooterEditions | `0x45b375c82b4f1662d27a0b75b078b81f0e7b2bf4` |
| MoralityProposalVoting | Not deployed (requires `NOUNS_TOKEN`) |

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
