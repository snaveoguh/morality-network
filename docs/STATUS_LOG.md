# Status Log

Use this log for periodic updates tied to deliverable IDs.

Historical entries may mention Vercel-era infrastructure. For the current deployment topology and service ownership, use `docs/DEPLOYMENTS.md`.

## Update Template

- Date:
- Owner:
- Deliverable IDs:
- Progress:
- Validation:
- Blockers:
- Next step:

---

## 2026-03-24

- Owner: Core
- Deliverable IDs: `A-002`, `A-003`, `B-001`, `E-001`, `G-001`, `H-001`
- Progress:
  - **Vercel cost reduction:** Slashed ISR revalidation from 30-60s to 1hr across all secondary pages (signals, proposals, predictions, pepe, discuss, nouns). Homepage at 15min. Markets API stays at 30s for scalper. Newsroom cron reduced from every 2h (12x/day) to 3x/day (6am, 2pm, 10pm UTC). Removed fetchAllFeeds() fallback from OG image generation. Feed API cache bumped from 5min to 15min. Estimated savings: ~$160/mo function duration.
  - **Trading system live:** Trader engine + scalper running on Hyperliquid perps. 20 watch markets. Composite signal system wired (editorial + technical indicators). Position-aware coordination between trader and scalper. Rationale tracking on every trade open/close. 10min per-symbol cooldown. Leverage-aware stop-loss and trailing stops.
  - **Agent system live:** Bus-coordinator, launch-scanner, research-swarm, trader, and scalper agents registered. Agent bus with bridge relay to noun.wtf. Memory learn/self-learn endpoints. SSE event stream. Console logging.
  - **Vault rail contracts:** 10 contracts (BaseCapitalVault, WithdrawalQueue, MorphoReserveAllocator, BridgeRouter, NavReporter, ExecutorAssetConverter, ExecutorBridgeAdapter, ArbTransitEscrow, HLStrategyManager + DevReserveVault). Security audit completed. UUPS upgrade script added. Reentrancy, NAV bounds, slippage, and storage gap fixes applied.
  - **Contract hardening:** Gas optimization (unchecked loop increments across 5 contracts). Reentrancy guard fixes. rescueETH drain prevention. Shared interface extraction.
  - **Code quality:** Pre-commit hooks (TypeScript, ESLint, Solidity build, jscpd copy-paste detection). Replaced bare console.log with reportError/reportWarn. Fixed catch(err: any) to catch(err: unknown). Extracted shared fetchWithRetry utility.
  - **Extension:** Kawaii pooter face with cursor-tracking blinking eyes added to popup.
  - **Documentation:** Full API reference rewrite (8 endpoints -> 73 endpoints). All docs audited and updated. AGENTS.md philosophy doc added.
- Validation:
  - `web`: TypeScript strict check passed. Build succeeds on Vercel (55s).
  - `contracts`: Solidity build passes. Security audit fixes applied.
  - Pre-commit hooks running on all commits.
- Blockers:
  - None active.
- Next step:
  - Monitor Vercel billing next cycle to confirm cost reduction.
  - Deploy contracts to Base mainnet (currently Sepolia).
  - Wire Prisma + PostgreSQL indexing layer.

---

## 2026-03-07

- Owner: Codex
- Deliverable IDs: `B-001`, `B-002`, `B-003`, `B-004`, `E-005`, `G-001`
- Progress:
  - Added first indexer API endpoints for entity and feed queries.
  - Added normalized web endpoint `GET /api/v1/governance/live` with filters and cursor pagination.
  - Added dedicated style guide route in web app (`/style-guide`).
  - Added architecture/API/deployments/roadmap/style docs under `docs`.
  - Added execution framework docs (tracker + plan + GitHub workflow).
  - Hardened indexer config with RPC fallback transport and explicit DB mode configuration.
  - Added indexer runbook and refreshed env examples for stable runtime setup.
- Validation:
  - `indexer`: `npm run codegen` passed.
  - `web`: targeted eslint checks passed for new files.
- Blockers:
  - Network-restricted environment prevents external DNS access to Base Sepolia RPC and Google Fonts during some runtime/build checks.
- Next step:
  - Execute `B-001` stable indexer runtime with reachable RPC and persistent DB.
