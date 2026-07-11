# Claim Ledger — Spec v0.1 (UK First)

**One-liner:** a longitudinal calibration ledger for public figures. Every checkable claim a
politician makes gets extracted, timestamped, resolved against primary sources when reality
reports back, and rolled into a public per-figure track record. Not episodic fact-checks —
compounding score history. The feed tells people what to feel; the ledger lets them check
who's been right.

**Differentiation vs Full Fact / fact-checkers:** they publish articles about individual
claims. We publish *records* — sortable, longitudinal, per-figure calibration scores where
every cell links to a primary source. The moat is time: whoever has 3 years of scores owns
a dataset nobody can retroactively build. Ship early, let the archive compound.

---

## Principles (non-negotiable)

1. **Claims, not bodies.** The instrument reads what people said vs what records show.
   No face, voice, or "deception" analysis of any kind, ever. (Science is chance-level;
   see Othello error. Decided 10 Jul 2026.)
2. **Every verdict is a document chain.** Verbatim quote + source link + utterance date +
   evidence links. No verdict without a citation a reader can click.
3. **Absence of evidence renders as absence.** Registry gaps are reported as gaps in the
   registry, never as suspicion. No "could be secretly funded by" outputs — the funding
   module is registry-based only.
4. **Never the word "lie."** A lie requires knowledge + intent, which records cannot show.
   Ledger vocabulary: `resolved true` / `resolved false` / `partially true` / `unresolved` /
   `unfalsifiable`. UI copy must never infer motive.
5. **Church and state.** The Ledger is a separate section with a sworn style (quote, source,
   date, verdict — no adjectives). Editorial/Originals may cite the ledger; they never blend
   with it.
6. **The knife test.** Every feature must get more valuable the more accurate it is. Any
   feature whose engagement grows with false confidence gets cut.

## Reuse map (what the repo already gives us)

| Existing | Role in ledger |
|---|---|
| `MoralityRegistry.sol` | Register MPs/ministers as entities (one entity per person, keyed to Parliament Member ID) |
| `MoralityLeaderboard.sol` | Add calibration as a scoring dimension (extend composite, or v2 ledger-specific board) |
| `indexer/` (Ponder + Postgres) | Claims, resolutions, scores live here off-chain |
| Agent Hub (`heartfelt-flow`) | Extraction + classification agents |
| `web/src/lib/parliament.ts` | Already fetches Commons/Lords divisions — extend for Hansard text |
| `web/src/lib/governance.ts` | UK petitions/bills Phase 0 patterns to copy |
| `MoralityPredictionMarket.sol` | **Deferred.** Staking on unresolved claims creates incentive to manipulate resolution. Revisit only after ledger credibility is established. |
| Base L2 | Tamper-evidence: batch claim hashes into a daily Merkle root, one tx/day. Not one tx per claim. |

## Data sources (UK)

**Claims (what they said):**
- Hansard API — `hansard-api.parliament.uk` — full text, digitised back to 1803
- Members API — `members-api.parliament.uk` — canonical MP identity, roles, dates
- TheyWorkForYou API — cross-check + convenience endpoints
- PMQs transcripts (via Hansard), ministerial statements, select committee evidence
- Party manifestos (2010, 2015, 2017, 2019, 2024) — PDF corpus, one-off ingest
- Budget speeches + OBR Economic & Fiscal Outlooks

**Resolution (what turned out true):**
- ONS API (statistics claims)
- OBR forecast evaluation reports (fiscal/economic predictions — cleanest resolutions available)
- Hansard itself (voting-record claims: "I voted against X" is checkable in divisions data)
- Court judgments / public inquiries (Covid Inquiry, IICSA, etc.) — human-curated
- GOV.UK Content API (policy outcome claims)

**Funding module (separate, registry-based only):**
- Electoral Commission donations register
- Register of Members' Financial Interests (published data)
- Companies House API (ownership graphs)
- Lobbying / ministerial meetings disclosures, procurement (Contracts Finder)
- Output = money map where every edge IS a document link. No inferred edges.

## Schema (indexer Postgres)

```
entities      id, parliament_member_id, name, party, registry_entity_id (onchain), active_from/to
claims        id, entity_id, verbatim_quote, normalized_claim, source_url, source_kind,
              uttered_at, context (debate/PMQs/manifesto/interview), extracted_by (agent+model+ver),
              claim_type (retrodictable | predictive | unfalsifiable),
              resolution_due (for predictive), merkle_batch_id, created_at
resolutions   id, claim_id, verdict (true|false|partial|unresolved), evidence[] (urls + excerpts),
              resolved_by (agent | human:<id>), reviewed_by (human:<id>, REQUIRED for false/partial),
              resolved_at, notes
scores        entity_id, window, n_claims, n_resolved, pct_true, brier (predictive only),
              checkability_rate, updated_at   -- materialized, recomputed on resolution
disputes      id, claim_id, raised_by (entity rep | public), status, response, resolved_at
merkle_batches id, root, tx_hash, day
```

## Pipeline

```
ingest (Hansard poll) → segment (speeches → statements)
  → extract (agent: pull checkable claims, verbatim + normalized)
  → classify (retrodictable / predictive+due-date / unfalsifiable → labeled, excluded from scores)
  → dedupe/cluster (same claim repeated across appearances = one claim, n occurrences)
  → publish as UNRESOLVED (immediately valuable: "what did they claim this week")
  → resolve (retrodictable: against sources now; predictive: cron on due date)
  → HUMAN REVIEW GATE: no "false"/"partial" verdict publishes without human sign-off
  → score recompute → daily Merkle root to Base
```

**Human gate is a launch requirement, not a nice-to-have.** Agent-published "false" verdicts
are libel roulette. Agents propose; a human approves every negative verdict. Budget: at PMQs
scale this is ~a dozen approvals/week.

## Scoring

- **Display threshold:** no public score until n ≥ 20 resolved claims (small-n scores are
  cherry-picking machines and unfair in both directions).
- **Retrodictable:** % resolved true, by category (statistics / voting record / policy outcome).
- **Predictive:** Brier score against resolution.
- **Checkability rate:** % of extracted statements that were checkable at all — publish it;
  "says almost nothing falsifiable" is itself signal.
- Confidence displayed with every score; per-category drill-down; every number clicks
  through to its claims.

## Backfill strategy (the time machine)

- **Tier 1 — Live (launch):** PMQs weekly + ministerial statements. ~50 claims/week.
- **Tier 2 — Modern backfill (the credibility weapon):** 2010 → now. Manifestos vs enacted
  record; Budget speeches vs OBR outturns (numeric, clean, indisputable); Covid-era claims vs
  Inquiry evidence. This is what lets us LAUNCH with track records instead of waiting years.
  Prioritise sitting MPs — dead politicians don't drive traffic or lawsuits.
- **Tier 3 — Deep archive (research mode):** Hansard to 1803. Genuinely interesting
  (predictions about Empire, appeasement, decimalisation) but different sourcing rigor.
  Keep OUT of scored ledger; separate "Archive" corpus.
- **Tier 4 — "Thousands of years":** Originals content series, not ledger. "History's
  claims, resolved" — Malthus, Nostradamus, millenarian predictions. Fun, shareable,
  editorial. Different evidentiary standards, so it must live on the editorial side of the
  church/state wall.

## Legal guardrails (UK defamation is claimant-friendly — treat as a design constraint)

1. Verdict template reviewed by a media solicitor BEFORE first publish (one-time cost).
2. Defences we build for: truth (s.2 Defamation Act 2013), honest opinion (s.3), public
   interest (s.4). Every output structured to qualify: verbatim quote, primary sources,
   no motive language.
3. **Right of reply as a feature:** any scored figure (verified office) can attach a
   dispute/response to any claim, displayed inline. Legally protective AND product gold —
   politicians engaging with their own ledger rows is the growth loop.
4. Corrections process: published, versioned, fast. Errors acknowledged loudly.
5. GDPR: public figures' public statements are fair game, but scores are personal data —
   corrections + dispute process above covers the accuracy obligation.

## Risks / open items

- **Contracts are unaudited.** Before the ledger makes powerful enemies, audit or de-scope
  what's onchain. At minimum the Merkle-batch contract is tiny and auditable cheaply.
- **Adversarial attention scales with success.** Rate-limit + harden indexer/API before
  Tier 2 publish. (Overlaps existing LAUNCH_HARDENING.md.)
- **Extraction errors:** every published claim links its Hansard source; wrong extractions
  are visible and disputable by construction. Track extraction precision on a golden set.
- **Model choice:** extraction quality > cost here. Agent Hub routes to Groq/Llama for
  editorials; claim extraction should be benchmarked and may warrant a stronger model.
- **Prediction market on truth:** deferred (see reuse map). Manipulation surface too hot
  until ledger reputation exists.

## MVP plan

- **Phase A (week 1-2):** Hansard ingest for PMQs; extraction agent + golden-set benchmark;
  claims table + unresolved claims page ("This week's checkable claims"). No verdicts yet —
  zero libel surface, immediate content.
- **Phase B (week 3-4):** resolution for voting-record + statistics claims (Hansard divisions,
  ONS); human review queue UI; first verdicts publish; solicitor template review.
- **Phase C (week 5-8):** Budget-vs-OBR backfill (Tier 2 start); per-entity pages;
  calibration scores go live at n≥20; daily Merkle root to Base; right-of-reply mechanism.
- **Phase D (later):** manifesto backfill, funding money-map module, Lords, devolved
  parliaments, US expansion.
