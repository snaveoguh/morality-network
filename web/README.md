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
- `/api/stumble`
- `/api/auth/nonce`
- `/api/auth/verify`
- `/api/ai/score`

For indexer-backed APIs, see `v2/indexer` and `v2/docs/API_REFERENCE.md`.

## Local Run

```bash
cd v2/web
npm install
npm run dev
```

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
- `v2/docs/STYLE_GUIDE.md`
- `v2/docs/DELIVERABLES_MASTER.md`
