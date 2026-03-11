# Deliverables Master Tracker

Status legend:
- `Not Started`
- `In Progress`
- `Blocked`
- `Ready for Review`
- `Done`

## A. Protocol & Contracts

| ID | Deliverable | Owner | Status | Acceptance Criteria |
|---|---|---|---|---|
| A-001 | Complete contract threat model + assumptions doc | Core | Not Started | Documented adversaries, trust boundaries, and attack surface per contract |
| A-002 | Add full Foundry test suite for all critical paths | Core | Not Started | Happy path + failure path coverage for registry, ratings, comments, tipping |
| A-003 | Add fuzz tests for rating/comment/tip invariants | Core | Not Started | Invariants pass under fuzz, no critical regressions |
| A-004 | Add differential tests for `rate` vs `rateWithReason` behavior | Core | Not Started | Event/state parity confirmed except reason fields |
| A-005 | Define and implement upgrade/deployment strategy | Core | Not Started | Written policy for migrations, versioning, and deprecations |
| A-006 | Mainnet deployment checklist and dry run | Core | Not Started | Signed checklist and reproducible script output |

## B. Indexer & Data Plane

| ID | Deliverable | Owner | Status | Acceptance Criteria |
|---|---|---|---|---|
| B-001 | Stand up indexer with stable RPC + persistent DB | Data | In Progress | Continuous sync without gaps, restart-safe |
| B-002 | Ship `GET /api/v1/entities/:entityHash` | Data | Done | Returns normalized entity profile and recent activity |
| B-003 | Ship `GET /api/v1/entities/:entityHash/feed` | Data | Done | Cursor pagination + action-type filters |
| B-004 | Ship `GET /api/v1/feed/global` | Data | Done | Global feed with cursor + actor/entity filters |
| B-005 | Ship `GET /api/v1/governance/live` | Data | In Progress | Unified normalized governance feed |
| B-006 | Add tag index + query API for high-volume filtering | Data | Not Started | Tag filters support large cardinality |
| B-007 | Add API auth/rate limit middleware | Data | Not Started | Key-based quotas enforced and logged |
| B-008 | Add export job endpoint for paid tier | Data | Not Started | Async dataset exports with status polling |

## C. Governance Ingestion

| ID | Deliverable | Owner | Status | Acceptance Criteria |
|---|---|---|---|---|
| C-001 | Stabilize UK Parliament adapter | Ingestion | Not Started | Consistent parsing + retries + schema parity |
| C-002 | Add US Congress adapter | Ingestion | Not Started | Bills/votes mapped to canonical proposal model |
| C-003 | Add EU adapter | Ingestion | Not Started | Vote events + metadata mapped to canonical model |
| C-004 | Add Canada adapter | Ingestion | Not Started | Bills/divisions represented in canonical schema |
| C-005 | Add Australia adapter | Ingestion | Not Started | Proposal and vote states normalized |
| C-006 | Expand DAO adapters (Tally/Snapshot ecosystems) | Ingestion | Not Started | At least 10 major DAO sources normalized |
| C-007 | Add SEC/corporate governance adapter | Ingestion | Not Started | Filings/votes surfaced in same feed contracts |

## D. Extension UX & Interaction

| ID | Deliverable | Owner | Status | Acceptance Criteria |
|---|---|---|---|---|
| D-001 | Ensure links are never hijacked by panel interactions | Extension | In Progress | 0 blocked links in manual test matrix |
| D-002 | Restore reliable hover overlays on detected entities | Extension | In Progress | Overlays appear under dynamic DOM updates |
| D-003 | Improve panel compose and post-confirmation refresh | Extension | In Progress | Comment/rating appears after confirmation without manual reload |
| D-004 | Add keyboard-first actions and accessibility pass | Extension | Not Started | Keyboard navigation and labels verified |
| D-005 | Add telemetry hooks for UX pain points | Extension | Not Started | Events captured for failed tx, blocked actions, close rates |

## E. Web Product Surfaces

| ID | Deliverable | Owner | Status | Acceptance Criteria |
|---|---|---|---|---|
| E-001 | Wire feed UI to indexer `/api/v1/feed/global` | Web | Not Started | Feed uses canonical API, fallback strategy documented |
| E-002 | Wire entity/profile pages to indexer entity endpoints | Web | Not Started | Entity page SSR/CSR resolves profile + feed |
| E-003 | Add proposal rail powered by governance live endpoint | Web | Not Started | Right rail updates from unified governance data |
| E-004 | Add advanced tag and source filters at UI level | Web | Not Started | Multi-tag filters with clear query state |
| E-005 | Add style-guide route and docs integration | Web | Done | `/style-guide` live, linked in nav and docs |

## F. Trust, Safety, and Sybil Resistance

| ID | Deliverable | Owner | Status | Acceptance Criteria |
|---|---|---|---|---|
| F-001 | Baseline anti-spam/rate controls for writes | Trust | Not Started | Write abuse limits and enforcement configured |
| F-002 | Reputation-weighted moderation signal model | Trust | Not Started | Weighted ranking for feed confidence |
| F-003 | Stake/deposit mechanism for high-frequency posting | Trust | Not Started | Economic friction for spam campaigns |
| F-004 | Abuse review runbook | Trust | Not Started | On-call process for incident triage |

## G. Developer Ecosystem & Monetization

| ID | Deliverable | Owner | Status | Acceptance Criteria |
|---|---|---|---|---|
| G-001 | Public API docs with request/response examples | Platform | In Progress | Every live endpoint documented with examples |
| G-002 | TypeScript SDK for API consumers | Platform | Not Started | Installable package with typed client methods |
| G-003 | API plan tiers + key management | Platform | Not Started | Free/pro/enterprise paths and key lifecycle |
| G-004 | Partner integration guide (exchanges/banks/research) | Platform | Not Started | Clear onboarding guide and use cases |

## H. Ops, Reliability, and Security

| ID | Deliverable | Owner | Status | Acceptance Criteria |
|---|---|---|---|---|
| H-001 | CI checks for contracts/web/extension/indexer | Ops | Not Started | Automated checks run on PRs |
| H-002 | Runtime monitoring + alerting (API/indexer) | Ops | Not Started | Error/latency/sync lag alerts configured |
| H-003 | Secrets management policy | Ops | Not Started | No raw keys in repo, documented secret paths |
| H-004 | Incident response + rollback runbook | Ops | Not Started | Documented rollback and comms checklist |

## I. Deliberation Graph + Polis Interop

| ID | Deliverable | Owner | Status | Acceptance Criteria |
|---|---|---|---|---|
| I-001 | Define canonical mapping: `entity -> claim -> interpretation -> evidence -> outcome` | Core | In Progress | Written schema + TS types used by web/indexer |
| I-002 | Add claim extraction pipeline for feed items | Data | Not Started | Every article has a canonical claim string with confidence score |
| I-003 | Add multi-dimensional ratings (`truth`, `importance`, `moralImpact`) | Core | Not Started | Contract + indexer + web support all 3 dimensions |
| I-004 | Add argument graph primitives (`claim`, `counterclaim`, `evidence`, `source`) | Core | Not Started | Structured post types queryable per entity |
| I-005 | Build Polis import adapter (read-only) | Data | Not Started | Ingest Polis statements/votes/clusters into normalized tables |
| I-006 | Add Polis compatibility API (`/api/v1/deliberation/*`) | Platform | Not Started | Endpoints expose consensus, disagreement, and cluster summaries |
| I-007 | Add periodic onchain archive snapshots for offchain deliberation data | Ops | Not Started | Monthly content-addressed snapshot + hash anchored onchain |
| I-008 | Ship timeline view: interpretation shifts over time | Web | Not Started | Entity timeline shows state changes and consensus movement |

## Current Focus Queue (Sequential)

1. `B-001` Stable indexer runtime and reliable sync.
2. `B-005` Governance live endpoint.
3. `E-001` + `E-003` Wire web feed and proposal rail to indexer APIs.
4. `D-001` + `D-002` Extension interaction reliability.
5. `F-001` Baseline anti-spam controls.
6. `I-001` Canonical interpretation schema and type rollout.
7. `I-005` Polis read-only adapter with normalized import.
