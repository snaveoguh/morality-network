# API Reference

This document tracks both implemented and planned API endpoints.

## Status Legend

- `live`: implemented in current codebase
- `planned`: spec-ready, implementation pending

## Base URL

When running web locally:

`http://localhost:3000/api`

When running indexer locally:

`http://localhost:42069`

## Live Endpoints (`web/src/app/api`)

### `GET /api/feed` (`live`)

Returns merged RSS feed items.

Query params:
- `category` (optional)

Response:
- `{ items: FeedItem[], total: number }`

### `GET /api/feed/sources` (`live`)

Returns configured RSS sources.

Response:
- `{ sources: FeedSource[] }`

### `GET /api/governance` (`live`)

Returns governance proposals from configured providers.

Query params:
- `filter` (`live`, `controversial`, or omitted for all)

Response:
- `{ proposals: Proposal[], total: number, timestamp: number }`

### `GET /api/governance/:id` (`live`)

Returns one governance proposal by id, with fallback logic.

Response:
- `{ proposal: Proposal, timestamp: number }`
- `404` if not found

### `GET /api/v1/governance/live` (`live`)

Normalized governance stream API for product and partner consumers.

Query params:
- `scope` (`live` default, `all`)
- `source` (comma-separated source ids)
- `sourceKind` (comma-separated: `dao`, `government`, `corporate`)
- `status` (comma-separated proposal statuses)
- `tag` (comma-separated tags)
- `cursor` (unix seconds)
- `limit` (max `500`)

Response:
- `{ data: GovernanceItem[], meta: { totalFiltered, nextCursor, generatedAt, ... } }`

### `GET /api/auth/nonce` (`live`)

Returns SIWE nonce.

Response:
- `{ nonce: string }`

### `POST /api/auth/verify` (`live`)

Verifies SIWE message + signature.

Body:
- `{ message: SiweMessage, signature: string }`

Response:
- `{ address: string, chainId: number }`

### `POST /api/ai/score` (`live`)

AI scoring interface (currently placeholder scoring logic).

Body:
- `identifier: string`
- `entityType: "URL" | "DOMAIN" | "ADDRESS" | "CONTRACT"`
- `content?: string`

Response:
- `{ identifier, entityType, score, compositeAIScore, timestamp }`

### `GET /api/stumble` (`live`)

Returns stumble content batch or a single random item.

Query params:
- `mode=single` for one item

Response:
- `StumbleItem[]` (default)
- `StumbleItem` (`mode=single`)

## Indexer Endpoints (`live`)

Implemented in: `indexer/src/api/routes.ts`

### `GET /api/v1/health` (`live`)

Health check for indexer API server.

Response:
- `{ ok: boolean, timestamp: number }`

### `GET /api/v1/entities/:entityHash` (`live`)

Returns one indexed entity with aggregate stats and recent activity.

Response:
- `{ data: { entity, recentActivity[] }, meta }`

### `GET /api/v1/entities/:entityHash/feed` (`live`)

Returns per-entity activity feed.

Query params:
- `limit`
- `cursor` (unix seconds)
- `actionTypes` (comma-separated `0..4`)

### `GET /api/v1/feed/global` (`live`)

Returns global activity feed across entities.

Query params:
- `limit`
- `cursor` (unix seconds)
- `from` (unix seconds)
- `to` (unix seconds)
- `actionTypes` (comma-separated `0..4`)
- `actor` (0x address)
- `entityType` (`0..3`)

## Planned Public Indexer API (`planned`)

### `GET /api/v1/sentiment/tags/:tag`

Aggregate fear/greed/trust/distrust signals from ratings/comments metadata.

### `POST /api/v1/exports/query`

Async dataset export for enterprise customers.

Body:
- filters + dimensions + metrics

## Suggested Response Envelope (planned)

```json
{
  "data": {},
  "meta": {
    "cursor": "...",
    "nextCursor": "...",
    "generatedAt": 0
  },
  "error": null
}
```

## Recommended Next Implementation Order

1. `GET /api/v1/governance/live`
2. `GET /api/v1/sentiment/tags/:tag`
3. `POST /api/v1/exports/query`
