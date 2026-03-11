# Open-Source Roadmap

## Goal

Build an open, composable, onchain context layer for:
- news
- governance proposals
- community ratings/comments/tips
- sentiment and consensus signals

## Product Tracks

### 1. Open Data Layer

Ship a public API + schema docs so anyone can:
- query entity reputation
- query governance activity
- pull feed-level activity streams
- build their own UIs or quant pipelines

### 1.5 Deliberation Interop Layer (Polis-Compatible)

- map conversation statements into canonical claims/interpretations
- import agree/disagree/pass votes as interpretation signals
- preserve cluster/consensus outputs as first-class graph edges
- expose compatibility endpoints for governments/civic integrators already using Polis

### 2. Open Client Surfaces

- Web app (`v2/web`)
- Chrome extension (`v2/extension`)
- SDK + typed client (planned)

### 3. Open Indexing Layer

- Ponder indexer (`v2/indexer`)
- Normalized tables for ratings, comments, tips, and feed items
- Stable query contract for future paid API tier

## Proposed Governance Source Expansion

Priority order:
1. UK Parliament (stabilize existing integration)
2. US Congress (active bills + votes)
3. EU Parliament (votes + legislative docs)
4. Canada House/Senate
5. Australia Parliament
6. SEC filings and corporate vote events
7. DAO sources beyond current set (Tally/Snapshot ecosystems)

## Target API Consumers

- crypto exchanges (risk, governance, sentiment overlays)
- funds and desks (market context, event-driven signals)
- banks and research desks (reputation + policy signal ingestion)
- media intelligence tools (source trust + narrative drift)
- compliance/risk tooling (behavioral context around entities)

## Monetization Model (Proposed)

- Free tier: low-rate API, delayed aggregates
- Pro tier: real-time streams, expanded history, export jobs
- Enterprise tier: dedicated SLAs, custom enrichment, private ingestion connectors

## Privacy and Identity Direction

Short term:
- wallet-based pseudonymity
- avoid collecting unnecessary PII

Mid term:
- selective disclosure proofs for reputation claims
- optional private attestations

Long term research:
- ZK proof integrations for private voting/rating attestations
- privacy-preserving analytics for sentiment cohorts

## Delivery Phases

### Phase A (Now)

- stabilize current onchain + extension UX
- complete docs + style guide + API contracts
- define stable indexer-backed endpoint shape

### Phase B

- launch first public indexer endpoints
- publish SDK
- add tagging and filtering at API level

### Phase C

- paid API plans
- expanded governance ingestion at global scale
- advanced sentiment and consensus analytics

## Contribution Focus Areas

- governance adapters (new countries/DAOs)
- indexer event processors and schema evolution
- API layer performance and caching
- UI/UX polish for extension interactions and discoverability
