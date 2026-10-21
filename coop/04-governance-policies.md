# 04 — Governance policies

**Status:** draft policies for board adoption once the new rules are registered. They sit under rules 8 (conflicts), 9 (asset lock) and 10 (editorial independence) in [02-draft-rules-outline.md](02-draft-rules-outline.md). Each policy is reviewed by the board every year and published at pooter.world/coop. Figures in `[brackets]` are for the board to set.

---

## A. Editorial firewall and declared-interest policy

### A1. Why we need it

We score what politicians and public bodies say and promise. We also apply for grants and programmes, some funded or run by public bodies or by people with political connections, and we may work with partners who are themselves covered by our tools. Readers need to be able to trust that none of this affects a score. Our rules (clause 10) say no member, funder, partner or investor may direct or veto any published record. This policy is how we make that true in practice.

### A2. Two separate roles

| Role | Does | Does not |
|---|---|---|
| **Pitch side** (fundraising, partnerships, programme applications) | Writes funding bids, talks to funders and partners, negotiates grant terms | Score claims or pledges; edit methodology; see unpublished scores about a funder, programme or partner they are dealing with |
| **Scoring side** (editorial, data, methodology) | Scores claims and pledges, writes methodology, handles corrections | Take part in pitching to a body whose office-holders or programmes they are scoring in the same period |

- In a team of three, one person can't be on both sides for the same body at the same time. The board keeps a written **role allocation** for each live application and each body being scored.
- Where the team is too small to separate roles for a particular body, the scoring is done or checked by the **outside reviewer** (A5).
- Role allocation is reviewed at each board meeting.

### A3. Coverage of programmes and bodies we apply to

When we apply to, receive money from, or partner with a body, and that body (or its office-holders) is also within scope of the Claim Ledger or Pledge Ledger:

1. **Declare** the relationship in the register of interests within `[7]` days of the application being made.
2. **Disclose** on every affected published record: "Morality Co-operative has applied to / receives funding from / is a partner of [body]. See our declared interests."
3. **Do not pause or soften** coverage. Claims and pledges are scored on the same method and timetable as everything else.
4. **Second check:** every score about that body, its office-holders or the programme is checked by the outside reviewer before publication, for the length of the application and `[12]` months after any funding ends.
5. **No pre-publication sight:** funders, applicants' contacts and partners never see a score before it is published, and are never told when one is coming beyond our normal public schedule.

### A4. Declared interests

Everyone on the board, every worker, and every regular contributor to scoring declares:

- political party membership, donations above `[£100]` a year, candidacy or paid political work, now or in the last `[5]` years;
- employment, directorships, trusteeships and paid advisory roles;
- close family relationships with elected office-holders or senior officials in bodies we score;
- financial interests above `[£1,000]` in any business connected with bodies we score;
- relationships with any funder or programme the co-operative has applied to.

The register is public, except for family details, which the board holds privately and summarises publicly ("X has a close family member who is a councillor in [area]").

**Recusal:** anyone with a declared interest in a claim, pledge or body does not score it, review its score, or decide a correction about it. The recusal is logged with the record.

### A5. Outside reviewer

- The board appoints at least one **outside reviewer**: someone with fact-checking, research or editorial experience, not a member, director or employee, and with no declared interest in the matter at hand. `[Candidates: academic fact-checking researchers; retired editors; another fact-checking organisation under a reciprocal arrangement.]`
- The outside reviewer:
  - checks scores flagged under A3 and A4;
  - hears appeals under the corrections process;
  - reviews a random sample of `[5]`% of each quarter's published scores;
  - reports to members once a year, unedited by the board.
- Paid a fixed fee set in advance, not tied to outcomes. Term of `[2]` years, renewable once.

### A6. Breaches

A suspected breach is reported to the chair (or, if the chair is involved, to the outside reviewer). The outside reviewer investigates and reports to the board. Affected records are re-checked and, if needed, corrected under the corrections process. Breaches are reported in the annual report.

---

## B. Treasury and spending-approval policy

### B1. Principles

- Member share capital is held for the purposes set out in the offer document and spent only under this policy.
- No one person can move the co-operative's money alone.
- Members see where the money goes every month.

### B2. Accounts

- **Operating account** for day-to-day income and spending.
- **Share capital account**: offer money held here until the offer closes; withdrawals paid from here.
- **Reserve account**: minimum reserve of `[3]` months' running costs, built up over `[2]` years.
- All accounts with a UK bank `[covered by the FSCS for the society's own deposits up to the limit: check eligibility]`. No co-operative money is held in crypto-assets, stablecoins or tokens. Gas for onchain publishing (section C) is bought in small amounts from the operating budget and capped at `[£200]` held at any time.

### B3. Signatories and approval thresholds

| Amount (per item or committed contract) | Approval needed | Payment release |
|---|---|---|
| Up to £`[500]` within an approved budget line | Any one budget holder | Two signatories |
| £`[500]`–£`[5,000]` within budget | Treasurer, or two directors | Two signatories |
| £`[5,000]`–£`[25,000]`, or any unbudgeted spend over £`[500]` | Board resolution, minuted | Two signatories |
| Over £`[25,000]`, any borrowing, or any multi-year commitment over £`[10,000]` | Board resolution including at least one reader or partner director voting in favour | Two signatories |
| Any use of share capital outside the uses in the offer document | General meeting | — |

- **Two signatories** for every payment: online banking set up for dual authorisation. At least `[3]` signatories in total, at least one of whom is not a worker member.
- Nobody approves a payment to themselves or a connected person. Worker pay is set by the board within the budget and paid through payroll.
- Card spending: one company card per worker, limit `[£500]`/month, receipts within `[7]` days, reviewed monthly by the treasurer.

### B4. Reporting

- **Monthly:** treasurer reports to the board: income and spending against budget, cash position, share capital held, reserve level, any approvals made under B3. A short summary is published to members within `[15]` working days of the month end.
- **Quarterly:** forecast update; withdrawal requests received and paid.
- **Annually:** accounts filed with the FCA; independent examination or audit as the Act and rules require; report to members at the AGM.

### B5. Share withdrawals and interest

- The board reviews withdrawal requests `[quarterly]`, pays them in order received, and stays within the annual limit set under rule 6.5.
- Interest is decided by the board each year, after the accounts are approved, only if the co-operative can afford it, and at no more than the cap in the rules.
- If the board suspends withdrawals, it tells all members within `[7]` days and explains why.

---

## C. Key-custody policy for onchain contracts

### C1. What we run onchain and why

We use public blockchains only to **publish tamper-evident records**, for example anchoring a daily Merkle root of the Claim Ledger so anyone can check that past records have not been changed. These contracts:

- hold no member money and no share capital;
- confer no membership, voting or financial rights in the co-operative (rule 3.2);
- are not tokens of the co-operative.

The old MO token and prediction-market contracts are outside this co-operative's share offer and membership entirely. This policy covers custody of any keys the co-operative controls.

### C2. Current position (October 2026) — to fix before the offer

From the project's own records:

- **LedgerAnchor** (Base, `0x1A55c83fb85D5d5Ab9415b016a47A56C0a54B99d`) is non-upgradeable. Its operator address (`0xd634…2933`) is controlled by a single private key stored on one machine and in a hosting environment variable. That is a **single hot key**.
- **Prediction market proxies** (Ethereum `0x2ea7…6608`, Base `0x71b2…12a`) are upgradeable. `[Confirm: who holds the owner/admin role today.]`

Before the share offer opens, the board will audit every contract the co-operative or its workers deployed, list who controls each privileged role, and move control under this policy or formally record why a contract is being retired.

### C3. Rules

1. **Owner and admin roles go to a multisig.** Any role that can upgrade a contract, change its operator, pause it, or move funds is held by a multisig wallet (e.g. Safe) with at least **`[2]`-of-`[3]`** signers, rising to **`[3]`-of-`[5]`** once the board has five or more directors.
2. **Signers are people, not servers.** Each signer holds their key on their own hardware wallet. No two signer keys are on the same device. At least one signer is a non-worker director.
3. **No single hot key controls anything that matters.** A server may hold a low-privilege **operator key** only if:
   - it can do one narrow thing (e.g. post a daily root), and nothing else;
   - the multisig can replace it at any time;
   - it holds no more than `[£50]` of gas;
   - if it is stolen, the worst outcome is a bad record that can be spotted and superseded, not loss of control or funds.
   For contracts like LedgerAnchor that cannot change operator, the board decides whether to redeploy with a multisig-controlled operator role.
4. **Operator keys live in a secrets manager**, not in files on laptops. Rotated at least every `[12]` months and immediately when someone with access leaves.
5. **Recovery:** the multisig signer list, threshold and recovery procedure are written down and held by the secretary. Seed phrases are never stored in plain text, email, chat or cloud documents. Each signer keeps their own backup in a separate physical location.
6. **Changes are minuted.** Any multisig transaction other than routine operator top-ups needs a board decision first, and is logged with its transaction hash in the board minutes and the monthly report.
7. **Leavers:** when a signer leaves the board or the co-operative, they are removed from the multisig within `[14]` days.
8. **Incidents:** suspected key compromise is reported to the chair at once. The multisig replaces or revokes the affected key, and members are told within `[7]` days.

### C4. Review

The board reviews this policy and the contract audit every year, and after any incident.
