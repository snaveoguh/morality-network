# pooter world Extension

Chrome extension for inline entity detection, contextual overlays, and onchain interactions.

## Capabilities

- Detect entities (URLs/domains/addresses/contracts/keywords) in page content.
- Show tooltip and side panel with score/rating/comments/tips.
- Submit onchain actions:
  - rate
  - rate with reason
  - comment
  - comment vote
  - tip entity/comment

## Structure

```text
src/
  shared/       contracts, hashing, rpc, wallet helpers, types
  background/   runtime message handlers + wallet transaction execution
  content/      detector, observer, tooltip, panel, overlays
  popup/        popup UI
```

## Local Development

1. Install deps:

```bash
cd v2/extension
npm install
```

2. Build extension:

```bash
npm run build
```

3. Load in Chrome:
- Open `chrome://extensions`
- Enable Developer Mode
- Click "Load unpacked"
- Select `v2/extension/dist`

## Contracts Config

Contract addresses and ABIs live in:
- `src/shared/contracts.ts`

## Current Focus

- Interaction reliability (no link hijack, smooth panel behavior)
- Overlay consistency on dynamic pages
- Post-transaction refresh and UX responsiveness

## Related Docs

- `v2/docs/STYLE_GUIDE.md`
- `v2/docs/DELIVERABLES_MASTER.md`
- `v2/docs/STATUS_LOG.md`
