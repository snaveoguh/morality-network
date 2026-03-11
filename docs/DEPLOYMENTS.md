# Deployments

## Base Sepolia (Chain ID: 84532)

Deployment date: 2026-03-06/07
Deployment script: `v2/contracts/script/DeployAll.s.sol`

| Contract | Address |
|---|---|
| MoralityRegistry | `0x2ea7502C4db5B8cfB329d8a9866EB6705b036608` |
| MoralityRatings | `0xb61bE51E8aEd1360EaA03Eb673F74D66eC4898D7` |
| MoralityComments | `0x29F66D8b15326cE7232c0277DBc2CbFDaaf93405` |
| MoralityTipping | `0x622cD30124e24dFFe77c29921bD7622e30d57F8B` |
| MoralityLeaderboard | `0x57dc0C9833A124FE39193dC6a554e0Ff37606202` |
| MoralityPredictionMarket | `0x27c79A57BE68EB62c9C6bB19875dB76D33FD099B` |
| MoralityProposalVoting | Not deployed (requires `NOUNS_TOKEN`) |

## Where Config Is Read

- Extension currently points to deployed Base Sepolia addresses in:
  - `v2/extension/src/shared/contracts.ts`
- Web uses env-overridable addresses in:
  - `v2/web/src/lib/contracts.ts`

## Explorer Links

Use Base Sepolia explorer format:

`https://sepolia.basescan.org/address/<CONTRACT_ADDRESS>`

Example:

`https://sepolia.basescan.org/address/0x29F66D8b15326cE7232c0277DBc2CbFDaaf93405`

## Notes

- `MoralityRatings` includes `rateWithReason` + `getRatingReason`.
- `MoralityComments.addTipToComment` is restricted to the tipping contract.
- `MoralityRegistry.claimOwnership` requires owner approval workflow.
