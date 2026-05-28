# Treasury Safe — deploy + rollout runbook

The Treasury Safe is the central vault sitting between the bridged USDC
inflow (Hyperliquid → Across → Base) and the per-agent Kernel SCWs.

This is **Week 1** of the Zodiac integration memo
(`memory/zodiac_integration_memo.md`). No Zodiac modules are attached yet —
just a vanilla 1-of-1 Safe with the operator EOA as sole signer. Modules
land in Week 2-3 (Roles) and Month 2 (Delay).

## What this gets you

- Bulk USDC sits in the Safe instead of the operator EOA. A compromised
  operator key still costs you what's in the EOA but **not** what's in the
  Safe (the Safe needs the signer to authorise each tx individually — and
  later, once Roles is attached, the signer can't drain it freely either).
- Distribution to agents is one tx instead of N, signed once.
- Threshold is a parameter: upgrade to 2-of-3 later without redeploying.

## Pre-flight checklist

- `PRIVATE_KEY` (operator EOA) available in your shell.
- The operator EOA holds a small ETH balance on the target chain
  (~0.0005 ETH on Base mainnet, more comfortably 0.001 ETH on testnet).
- For mainnet deploy: a Base RPC URL (Alchemy / public). Default fallback
  is `https://mainnet.base.org` which is fine for a one-shot deploy.

## Step 1 — dry-run on Base Sepolia

Predicts the Safe address without broadcasting:

```bash
PRIVATE_KEY=0x... node contracts/script/deploy_treasury_safe.mjs --network sepolia
```

Confirms imports + Protocol Kit init + balance check. Outputs the
predicted Safe address.

## Step 2 — execute on Base Sepolia

Real testnet deploy. Costs no real money, validates the whole flow:

```bash
PRIVATE_KEY=0x... node contracts/script/deploy_treasury_safe.mjs --network sepolia --execute
```

Writes `contracts/deployments/treasury-safe-base-sepolia.json` with the
deployed address. Verify on Basescan Sepolia.

## Step 3 — execute on Base mainnet

⚠️ **REAL ETH SPEND.** Confirm with the project owner before running.

```bash
PRIVATE_KEY=0x... node contracts/script/deploy_treasury_safe.mjs --network base --execute
```

Writes `contracts/deployments/treasury-safe-base.json`.

## Step 4 — wire up the runtime

After mainnet deploy, set the address on every service that ever calls
`executeSafeDistribution`:

- Railway web service (`earnest-love` for dev, `faithful-purpose` for prod):
  set `TREASURY_SAFE_ADDRESS_BASE=<deployed address>`.
- Local `.env.local` if you'll run the distribute path from your laptop.

## Step 5 — fund the Safe + first distribute

1. Send a small USDC test amount (e.g. $5) to the Safe address.
2. Call `executeSafeDistribution({ allocations: [...], dryRun: true })`
   first to inspect the resolved transfers + Safe balance.
3. Then `dryRun: false` to fire the real distribute. Result includes a
   single `txHash` covering all transfers in one Safe tx.

## What changed in the codebase

- `web/src/lib/treasury/safe.ts` — new. Protocol Kit wrapper +
  `safeBatchTransfer` helper.
- `web/src/lib/treasury/distribute.ts` — additive. New
  `executeSafeDistribution()` alongside the legacy `executeDistribution()`.
  Old path still works; switch callers when ready.
- `contracts/script/deploy_treasury_safe.mjs` — new. Standalone deploy.
- `contracts/deployments/treasury-safe-*.json` — written on deploy.

## What's intentionally NOT in this spike

- **Bridge recipient still defaults to operator EOA**, not Safe. Once Safe
  is funded + first distribute works, flip `executeArbToBaseBridge`
  callers to set `recipient` = Safe address.
- **No Zodiac modules**. Roles Modifier and Delay Modifier land in
  separate spikes per the memo's phasing.
- **No admin UI** for inspecting Safe state. Use Basescan or the Safe app
  at `app.safe.global` (the address works in the Safe UI as soon as it's
  deployed).

## Rollback

If something is wrong with the Safe path, no rollback is needed — the
legacy `executeDistribution()` (operator EOA path) is still there and
fully functional. Just unset `TREASURY_SAFE_ADDRESS_BASE` to disable the
Safe-aware branches that gate on `treasurySafeConfigured()`.
