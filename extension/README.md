# pooter world Extension

Chrome (MV3) extension for the Daily Witness review queue, inline entity
detection, contextual overlays, onchain interactions on Base, and a built-in
wallet exposed to pages as `window.pooterWallet` (EIP-1193 + EIP-6963).

## Capabilities

- Daily Witness popup tab (default): review one open claim from
  `pooter.world/api/review/open-rounds` with Support / Dispute / Can't verify.
- Account linking: SIWE-signed `POST /api/auth/token` → `pat_` bearer token in
  `chrome.storage.local` (degrades gracefully while the endpoint isn't live).
- Detect entities (URLs/domains/addresses/contracts/keywords) in page content.
- Show tooltip and side panel with score/rating/comments/tips.
- Submit onchain actions: rate, rate with reason, comment, comment vote,
  tip entity/comment.
- BIP-39 wallet: 12-word mnemonic root identity, EVM account at
  m/44'/60'/0'/0/0, AES-256-GCM at rest (PBKDF2-HMAC-SHA256, 310k iterations).
  Legacy 0.1.0 raw-key wallets keep working and migrate forward on unlock.

## Networks

Default network is **Base mainnet (8453)**; Base Sepolia (84532) remains
selectable in Settings. Contract addresses are pinned per chain id in
`src/shared/constants.ts` — the same address can hold a different contract on
the other chain, so never copy addresses across network blocks unverified.

## Structure

```text
src/
  shared/       constants (networks/addresses), ABIs, hashing, rpc, wallet,
                wallet-core (vendored @pooter/wallet), types
  background/   runtime message handlers, wallet tx execution, pooter.world API
  content/      detector, observer, tooltip, panel, overlays, provider bridge
  popup/        popup UI (witness / page / wallet / settings tabs)
```

`src/shared/wallet-core.ts` is a VENDORED copy of the shared `@pooter/wallet`
API (generateMnemonic, validateMnemonic, deriveEvmAccount, encryptMnemonic,
decryptMnemonic). When `packages/wallet` lands, swap the import — do not let
the implementations drift.

## Local Development

1. Install deps:

```bash
cd extension
npm install
```

2. Build, typecheck, test:

```bash
npm run build
npm run typecheck
npm test
```

3. Load in Chrome:
- Open `chrome://extensions`
- Enable Developer Mode
- Click "Load unpacked"
- Select `extension/dist`

## Contracts Config

Per-network contract addresses live in `src/shared/constants.ts` (NETWORKS).
ABIs live in `src/shared/contracts.ts`.
