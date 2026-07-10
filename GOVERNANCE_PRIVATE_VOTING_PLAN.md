# Governance & Private Voting — Build Plan

> Status: **planning** · Branch context: `feat/uk-governance` (off `dev`)
> Scope: flesh out governance (live supply + deployed voting) and build the
> private-ballot (ZK → FHE) infrastructure the charter calls for.
> This is a concrete plan grounded in what already exists — not a greenfield.

---

## 0. What already exists (audited 2026-05-30)

**Aggregation layer — `web/src/lib/governance.ts`**
- `Proposal` type with status `active|pending|closed|defeated|succeeded|queued|executed|candidate`, and `source` ∈ `snapshot|onchain|parliament|tally|congress|eu|canada|australia|sec|hyperliquid`.
- 14 live sources aggregated in `fetchAllProposalsUncached()`; **sort is already active-first** (`active:0 … closed:5`).
- `fetchSingleProposal()` — by-ID direct fetch for `nouns-`, `lilnouns-`, snapshot, and (new) `parliament-(commons|lords)-<id>` → **UK permalinks are now durable** (commit `03618ef`).

**Onchain voting — BUILT, NOT DEPLOYED**
- `contracts/src/MoralityProposalVoting.sol` (238 lines, UUPS): `castVote`, `getProposalVotes`, `getVote`, Noun-holder gas refunds, DAO resolver.
- `web/src/components/proposals/VotePanel.tsx` (206 lines): wagmi `useWriteContract` → `castVote`, gated by `PROPOSAL_VOTING_ADDRESS !== ZERO_ADDRESS`. Currently shows *"Voting contract not deployed on this network."*
- `web/src/lib/contracts.ts`: `PROPOSAL_VOTING_ADDRESS` / `PROPOSAL_VOTING_ABI` wired, env-gated on `NEXT_PUBLIC_PROPOSAL_VOTING_ADDRESS`.

**ZK toolchain — BUILT (recovery), reusable for voting**
- `circuits/password-recovery/password_recover.circom` — circom circuit + proving setup.
- `contracts/src/Groth16Verifier.sol` (51) + `IGroth16Verifier.sol` — on-chain Groth16 zk-SNARK verifier.
- `contracts/src/ZKRecovery.sol` (324) + `contracts/script/DeployZKRecovery.s.sol` — deploy pattern to mirror.

**UK government sources — endpoints live-tested (all 200 unless noted)**
| Source | Endpoint | Wired? |
|---|---|---|
| Commons votes | commonsvotes-api.parliament.uk | ✅ (divisions) |
| Lords votes | lordsvotes-api.parliament.uk | ✅ (divisions) |
| Petitions | petition.parliament.uk/petitions.json | ❌ **open = active** |
| Bills | bills-api.parliament.uk | ❌ |
| Members (MPs/Lords) | members-api.parliament.uk | ❌ |
| Legislation | legislation.gov.uk/new/data.feed | ❌ |
| Hansard | hansard-api.parliament.uk | ❌ (needs correct route) |

**Not built:** the FHE / private-ballot layer ("Interfold / CRISP" in the charter). The ZK *primitives* exist; the private *voting* system does not.

---

## 1. The "everything says ENDED" problem

Sort is already active-first, so this is a **supply** problem: the live feed is dominated by historical/closed items (every parliament division is `status:"closed"`; snapshot/nouns have few active). Fix = inject **live** governance (open petitions, in-progress bills) and visually demote closed items. Phase 0 solves this directly.

---

## 2. Phase 0 — Live UK governance supply  *(fastest visible win)*

**Goal:** the top of /proposals is live UK governance, not a wall of ENDED.

**New sources** (each a `fetch*()` added to `fetchAllProposalsUncached`, behind `withSourceTimeout`):
1. **UK Petitions** — `petition.parliament.uk/petitions.json?state=open`. Maps cleanly: `status:"active"`, `votesFor = signatureCount`, threshold context at 10k (response) / 100k (debate). Highest signal, simplest API.
2. **UK Bills** — `bills-api.parliament.uk/api/v1/Bills`. Status from current stage (`active` while progressing). Sponsor → `proposer`.
3. **Legislation** — `legislation.gov.uk/new/data.feed` (Atom) as informational items.
4. *(Members/Hansard deferred — context enrichment, not proposals.)*

**Data-model changes — `web/src/lib/governance.ts`**
- Extend `source` union: `+ "uk-petition" | "uk-bill" | "uk-legislation"`.
- Add optional fields (avoid type bloat — one namespaced bag): `uk?: { kind; signatureCount?; threshold?; stage?; sponsor?; house?; petitionState? }`.
- Converters `convertPetitionToProposal`, `convertBillToProposal` (mirror `convertDivisionToProposal`).

**Durability (extends commit `03618ef`)**
- Add by-ID direct fetch in `fetchSingleProposal` for `uk-petition-<id>` and `uk-bill-<id>` (both APIs serve single items by ID → permalinks durable, no storage needed).
- Implement **task #7** (proposal archive) for list-only sources (hyperliquid/canada/au/congress votes): persist on fetch, fall back on miss. Prefer the existing indexer backend over the local-file pattern for cross-deploy durability.

**UI — `web/src/components/feed/ProposalColumn.tsx` + `/proposals`**
- Source chips/filters: add 🇬🇧 Petitions / Bills.
- Default view favours `active`; collapse closed parliament divisions into a "Recent UK votes" secondary section so they don't flood the top.
- Petition card: signature progress bar vs 10k/100k thresholds. Bill card: stage tracker.

**Acceptance:** /proposals top is mostly live UK items; petition/bill permalinks resolve; `tsc` + dev build green.

---

## 3. Phase 1 — Deploy + activate signal voting

**Goal:** `VotePanel` actually casts votes (it's fully coded; just un-deployed).

1. Write `contracts/script/DeployProposalVoting.s.sol` (mirror `DeployZKRecovery.s.sol`): deploy `MoralityProposalVoting` behind a UUPS proxy, `initialize(nounsToken)`, transfer owner, `fund()` for gas refunds.
2. Deploy to **Base** (test on Base Sepolia first). Record in `DEPLOYMENTS.md`.
3. Set `NEXT_PUBLIC_PROPOSAL_VOTING_ADDRESS` (dev → prod). `VotePanel.votingAvailable` flips true automatically.
4. Verify: connect wallet → cast signal vote → `getProposalVotes` reflects it; Noun-holder refund path works.
5. Voting is keyed by `(dao, proposalId)` strings → already generic across all sources (UK, snapshot, hyperliquid…), no per-source work.

**Acceptance:** a real signal vote lands on-chain from the UI on at least one live UK proposal.

---

## 4. Phase 2 — Private voting infrastructure  *(the big R&D piece)*

The charter promises *"private onchain votes by members — member & permissible, not doxxed."* Build it in two layers; ship layer A first.

### Layer A — Anonymous membership voting (Semaphore-style, reuse Groth16)
Private **who**, public tally. Pragmatic, reuses the existing circom/Groth16 stack.

- **Identity / group:** members register an identity commitment into a Merkle tree (a `MembershipRegistry.sol`). Eligibility gate = ZK-KYC attestation (see below) → commitment, so the on-chain set is "member & permissible" without doxxing.
- **Circuit:** new `circuits/vote/vote.circom` — proves (a) Merkle membership, (b) a `nullifier = H(identitySecret, proposalId)` to prevent double-voting, (c) binds a `voteSignal` (for/against/abstain) + `proposalId`. Compile → Groth16 → `PrivateVotingVerifier.sol` (mirror existing verifier).
- **Ballot contract:** `PrivateBallot.sol` — verifies the proof via `PrivateVotingVerifier`, rejects used nullifiers, increments the public tally. Per-proposal Merkle root snapshot.
- **Client:** prove in-browser/worker with snarkjs (same toolchain as recovery). Vote tx carries proof + public signals only.
- **Result:** ballots are unlinkable to identity; tally is public and verifiable; no double votes.

### Layer B — Encrypted tally until close (toward charter's CRISP/FHE)
Private **tally** during the vote (coercion / herding resistance), revealed at close.
- Integrate **Enclave / CRISP** (Gnosis) — FHE threshold-encrypted ballots, committee/threshold decryption at close. This is the charter's stated design.
- Heavy + external; **defer to a dedicated milestone** (aligns with `memory/zodiac_integration_memo.md`: Enclave is a Q3-Q4 item once mainnet ships). Layer A delivers "private voting" credibly in the meantime.

### ZK-KYC eligibility (cross-cutting)
- "Member & permissible, not doxxed" needs an attestation → identity-commitment pipeline (e.g., a KYC provider issues a signed attestation; a circuit proves possession without revealing identity). Scope as its own sub-track; Layer A can launch with a simpler allowlist/token-gated Merkle set first, then swap in ZK-KYC.

**Acceptance (Layer A):** cast an anonymous vote that verifies on-chain, double-vote is rejected by nullifier, tally updates, and the voter↔ballot link is provably hidden.

---

## 5. Cross-cutting: durability & persistence
- Proposal archive (task #7) so **every** permalink survives source rotation — prefer indexer-backed (Postgres) over the committed-JSON pattern used for feed items, for cross-deploy durability on Railway.
- Per-source cache TTLs; keep the 4s `withSourceTimeout` so one slow source never blanks the page (note: Lords search payload is ~2.4MB and exceeds Next's fetch cache — page by ID or trim fields).

## 6. Sequencing & rough effort
1. **Phase 0** — live UK sources + curation — *small/medium* (days). Biggest visible payoff.
2. **Phase 1** — deploy voting — *small* (contract exists; mostly deploy + env + verify).
3. **Phase 2A** — ZK anonymous voting — *large* (circuit + 2 contracts + client proving + registry).
4. **ZK-KYC** — *medium/large*, parallelizable after 2A’s allowlist launch.
5. **Phase 2B** — CRISP/FHE encrypted tallies — *large, deferred* (Q3-Q4, post-mainnet).

## 7. Open decisions for Hugo
- **Voting power:** 1-member-1-vote (Semaphore) vs token-weighted? (Charter implies member votes → 1p1v; weighting hurts anonymity.)
- **Eligibility v1:** allowlist/token-gated Merkle set now, or block on ZK-KYC?
- **Coercion resistance:** is public-tally Layer A acceptable for launch, with FHE (Layer B) later? (Recommended: yes.)
- **Chain:** Base for ballots (cheap, where MO + smart wallets live)?
- **Deploy gate:** Phase 1 to Base Sepolia first, then mainnet?

---
*Generated as a planning artifact. Nothing here is built yet beyond §0. Pick a phase and I’ll start.*
