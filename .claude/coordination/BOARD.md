# Work Board
Generated: 2026-03-16T18:00:00Z
Next standup: 2026-03-16T21:00:00Z

## 30-Day Sprint Priority (Revenue-First)

Sprint Day 1. $0 earned. Week 1 target: first live moral trade + Farcaster presence.

⚠️ **CRITICAL**: 15 files modified but uncommitted. Do NOT claim trading/, scrapers.ts,
or layout files until these are committed. Check `git status` before claiming any file.

## Active Assignments

| Stream | Deliverable | Description | Session | Status | Files | Since |
|--------|-------------|-------------|---------|--------|-------|-------|
| — | — | No sessions registered | — | — | — | — |

## Shadow Locks (Uncommitted Work — Do Not Touch)

These files have uncommitted changes. No session may claim them until committed:

| File | Changed By | Likely Deliverable |
|------|-----------|-------------------|
| `v2/web/src/lib/trading/engine.ts` | Unknown session (uncommitted) | TRADING |
| `v2/web/src/lib/trading/scalper.ts` | Unknown session (uncommitted) | TRADING |
| `v2/web/src/lib/trading/types.ts` | Unknown session (uncommitted) | TRADING |
| `v2/web/src/lib/trading/config.ts` | Unknown session (uncommitted) | TRADING |
| `v2/web/src/app/api/markets/route.ts` | Unknown session (uncommitted) | TRADING |
| `v2/web/src/components/markets/AgentMarketDashboard.tsx` | Unknown session (uncommitted) | TRADING |
| `v2/web/src/data/editorial-archive.json` | Unknown session (uncommitted) | Editorial |
| `v2/web/src/lib/live-comments.ts` | Unknown session (uncommitted) | Extension/Web |
| `v2/web/src/lib/scrapers.ts` | Unknown session (uncommitted) | B-001 |
| `v2/web/src/components/layout/AsyncMasthead.tsx` | Unknown session (uncommitted) | Web |
| `v2/web/src/components/layout/MarqueeBanner.tsx` | Unknown session (uncommitted) | Web |
| `v2/web/src/providers/WagmiProvider.tsx` | Unknown session (uncommitted) | Web |
| `v2/web/vercel.json` | Unknown session (uncommitted) | Ops |
| `CLAUDE.md` | Unknown session (uncommitted) | Coordination |
| `v2/web/src/app/error.tsx` | Unknown session (uncommitted) | Web |

## Unassigned Priority Queue (Sprint-Ordered)

### Immediate (Human Operator)
0. **COMMIT** — Commit existing uncommitted work before assigning new sessions
   - Required before any session touches the shadow-locked files above
   - Verify SOUL.md trading constraints are in the engine code before committing

### Revenue Track (DO FIRST — after commit)
1. **TRADING** Complete moral compass signal integration + live execution
   - Files: `v2/web/src/lib/trading/signals.ts`, `v2/web/src/lib/trading/hyperliquid.ts`
   - Shadow-locked files will be clear after commit
   - SOUL constraint: long >70% score only, short <30% with documented harm, all trades public
   - Prerequisite: Commit existing trading work first
2. **MARKETING** Set up Farcaster write access (Neynar signer)
   - Files: `v2/web/src/lib/farcaster.ts`
   - No shadow lock on this file — SAFE TO CLAIM NOW
   - SOUL constraint: real P&L only, disclose AI content, no hype
3. **MARKETING** Set up Bluesky bot account + posting
   - Files: `v2/web/src/lib/bluesky.ts` (new)
   - No shadow lock — SAFE TO CLAIM NOW
   - SOUL constraint: no hype, amplify truth only
4. **G-003** API plan tiers + key management
   - Files: `v2/web/src/app/api/` (avoid markets/route.ts — shadow-locked)
   - Dependency: B-001 must be stable first; design work can start now
5. **TRADING-DASHBOARD** Wire /markets page with real P&L feed
   - Prerequisite: TRADING commit first
   - SOUL constraint: publish real P&L including losses

### Platform Stability (Parallel Track — safe to claim)
6. **B-001** Stable indexer runtime + persistent DB
   - Files: `v2/indexer/` (NOT scrapers.ts — shadow-locked)
   - Unblocks: B-005, E-001, E-003, G-003
   - Note: scrapers.ts has 165 new lines — check after commit, may be partially done
7. **B-005** Governance live endpoint
   - Files: `v2/indexer/`, `v2/web/src/app/api/governance/`
   - Blocked by B-001
8. **H-001** CI checks for contracts/web/indexer
   - Files: `.github/workflows/`
   - SAFE TO CLAIM NOW — no shadow locks
9. **A-002** Foundry test suite for critical paths
   - Files: `v2/contracts/test/`
   - SAFE TO CLAIM NOW — no shadow locks

### Product Polish (After Revenue)
10. **E-001** Wire feed UI to indexer API | Files: `v2/web/src/components/feed/`
11. **E-002** Wire entity pages to indexer | Files: `v2/web/src/app/entity/`
12. **D-001** Extension link hijack fix | Files: `v2/extension/`
13. **D-002** Extension hover overlays | Files: `v2/extension/`
14. **D-003** Extension panel compose refresh | Files: `v2/extension/`
15. **I-001** Canonical interpretation schema | Files: `v2/web/src/types/`

## Blocked Items

| Deliverable | Blocked By | Detail |
|-------------|------------|--------|
| B-005 | B-001 | Gov endpoint needs stable indexer |
| E-001 | B-001 | Feed wiring needs working indexer API |
| E-003 | B-001 | Proposal rail needs governance endpoint |
| G-003 | B-001 | API tiers need stable API to monetize |
| TRADING (continue) | Uncommitted work | Commit existing changes first |

## Dependency Chain

```
B-001 [GHOST-IN-PROGRESS, scrapers.ts shadow-locked] → B-005 [BLOCKED] + E-001 [BLOCKED] + E-003 [BLOCKED]
  → G-003 [BLOCKED]

TRADING [SPRINT PRIORITY] — shadow-locked until committed
MARKETING [SPRINT PRIORITY] — farcaster.ts + bluesky.ts SAFE NOW
H-001 [NOT STARTED] — SAFE NOW
A-002 [NOT STARTED] — SAFE NOW
```

## File Lock Table (Active Sessions)

No active session locks. Shadow locks from uncommitted work listed above.

## Session Protocol Reminder

New sessions: before editing any file:
1. Check this board's Shadow Locks table
2. Run `git status` to verify file is clean
3. Write session report to `.claude/coordination/sessions/<topic-slug>.md`
4. Then edit

See CLAUDE.md for full protocol.
