# Manager Decisions Log

## 2026-03-16T12:00:00Z
- Decision: Sprint priority overrides normal phase ordering
- Rationale: $1M in 30 days requires revenue-first sequencing. Trading and marketing
  can proceed independently of the indexer stability chain.
- Affected: All sessions — revenue tasks ranked above platform stability tasks
- Soul check: PASS — revenue through moral trading aligns with SOUL.md principles

## 2026-03-16T12:00:00Z
- Decision: Trading-first revenue strategy
- Rationale: Trading infrastructure is 90% built. Moral compass pipeline exists.
  Connecting them is the shortest path to revenue. API monetization is #2.
- Affected: TRADING deliverables prioritized above B-001
- Soul check: PASS — trading constrained by moral scores per SOUL.md

## 2026-03-16T12:00:00Z
- Decision: Farcaster + Bluesky for marketing (skip paid ads for now)
- Rationale: Free APIs, web3-native audiences, bot-friendly. Google Ads has crypto
  certification barriers. Real P&L from moral trading IS the marketing content.
- Affected: Marketing scheduled task focuses on organic social
- Soul check: PASS — no misleading claims, real data only per SOUL.md marketing constraints

## 2026-03-16T15:00:00Z
- Decision: Ghost-progress deliverables flagged but NOT auto-reset to "Not Started"
- Rationale: B-001, B-005, D-001/D-002/D-003, G-001, I-001 are all "In Progress" with no
  registered session. Auto-resetting risks clobbering work happening outside the coordination
  system. Human operator must confirm before status change.
- Affected: B-001, B-005, D-001, D-002, D-003, G-001, I-001
- Soul check: PASS — Transparency principle: do not manufacture certainty we don't have.
  Better to flag than silently overwrite state.

## 2026-03-16T15:00:00Z
- Decision: Sprint milestones not progressing — escalating to human operator
- Rationale: 0 of 7 Week 1 milestones started (trading engine, live trade, P&L dashboard,
  Farcaster bot, Bluesky bot, API auth, 3 coordinated sessions). No sessions registered.
  Sprint clock is running. Operator attention needed to spin up worker sessions.
- Affected: SPRINT.md weekly targets
- Soul check: PASS — transparency over optimism. Do not hide sprint slippage.

## 2026-03-16T18:00:00Z
- Decision: Shadow locks introduced for 15 uncommitted files
- Rationale: Significant work has occurred outside the coordination system (6,875 insertions
  across trading/, scrapers.ts, layout, editorial-archive). These files are effectively locked
  by uncommitted changes — new sessions must not touch them until committed or risk merge
  conflicts and lost work. Flagged as "shadow locks" in BOARD.md.
- Affected: trading/, scrapers.ts, layout components, editorial-archive.json, WagmiProvider,
  vercel.json, error.tsx, CLAUDE.md, markets/route.ts
- Soul check: PASS — Transparency principle (SOUL.md §2): coordination system must reflect
  actual state, not pretend conflicts don't exist.

## 2026-03-16T18:00:00Z
- Decision: Do NOT auto-reset ghost-progress deliverables to "Not Started"
- Rationale: Uncommitted diffs suggest active work on B-001 (scrapers.ts +165 lines) and
  TRADING deliverables. Auto-resetting would misrepresent sprint state. Human operator
  must review diffs and confirm deliverable status before updating DELIVERABLES_MASTER.md.
- Affected: B-001, TRADING (ghost progress)
- Soul check: PASS — Truth axis: do not manufacture progress or regress that hasn't been confirmed.
