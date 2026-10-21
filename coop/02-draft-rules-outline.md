# 02 — Draft rules outline: multi-stakeholder rules

**Status:** clause-by-clause brief for drafting with Co-operatives UK. It is not the rules themselves. The final text should follow the Co-operatives UK multi-stakeholder co-operative model rules as closely as possible, so that the sponsor route and reduced FCA fee apply ([RFCCBS 3.4](https://www.Handbook.fca.org.uk/handbook/RFCCBS/3/4.pdf)).

Markers:
- **[CUK]**: check with Co-operatives UK (fits the model rules? acceptable to the FCA?)
- **[SOL]**: needs a solicitor's view
- `[x]`: figure to be decided by members

---

## 1. Name and registered office

- 1.1 The society is Morality Co-operative Limited, registered under the Co-operative and Community Benefit Societies Act 2014, register no. 4621.
- 1.2 Registered office: 2 Queens Road, Haywards Heath RH16 1EB, or as the board decides.

## 2. Objects

- 2.1 The society's objects are to carry on the business of a co-operative by:
  - (a) building and running independent, open public-accountability tools, including pooter.world, the Claim Ledger and the Pledge Ledger, that record what public office-holders and public bodies say and promise and check it against the public record;
  - (b) publishing those records, their methods and their underlying data freely to the public;
  - (c) providing fair and secure work for its worker members;
  - (d) working with readers and local partners to improve the accountability of public life in the UK.
- 2.2 The society will carry on its business for the mutual benefit of its members as workers, readers and partners, and with regard to the interests of the wider community.
- **[CUK]** Confirm that (b) and (d) do not tip the objects towards community benefit in a way that undermines the co-operative condition (see [FG15/12](https://www.fca.org.uk/static/documents/fg15-12.pdf) on bona fide co-operatives).

## 3. Powers

- 3.1 Standard model-rule powers (borrow, invest, employ, contract, hold property, apply for grants).
- 3.2 **Exclusions written into the powers:**
  - The society shall not issue, or permit to be issued in its name, any token, digital asset or instrument that represents shares, membership rights, voting rights or any right to the society's surplus or assets.
  - Any digital record the society runs (for example an onchain anchor of published data) is a publishing tool and confers no rights in the society.
  - **[SOL]** Wording that is clear without being so broad it catches ordinary software work (e.g. signing data, NFTs used purely as receipts). Consider dropping "permit to be issued in its name" if unenforceable.

## 4. Membership: three classes

### 4.1 Worker members
- Eligibility: an individual employed by the society, or contracted to work for it for at least `[16]` hours a month on average over the previous `[6]` months.
- Joining: applies in writing; board admits after the qualifying period; holds one worker share of £`[1]`.
- Leaving: membership ends `[3]` months after the person stops working for the society, unless they apply to become a reader member.
- Existing members (Hugo Evans, Tom Maltby, Matt Sharp) are worker members from the date the new rules are registered.

### 4.2 Reader members
- Eligibility: an individual aged 16 or over who supports the objects and uses the society's services.
- Joining: applies online; buys the minimum shareholding of £`[25]`; board (or a delegated officer under a written policy) admits. The board may refuse only on grounds set out in a published membership policy.
- **[CUK]** Is "uses the society's services" enough of a mutual relationship when the service is free? Possible strengthening: readers can submit claims for checking, take part in member review panels, and receive member reports.

### 4.3 Partner members
- Eligibility: a body corporate or unincorporated association with a base or substantial activity in the UK whose aims are consistent with the objects. Examples: community groups, local civic bodies, other co-operatives, local news outlets, universities, tenants' and residents' associations.
- Joining: applies in writing naming an authorised representative; buys the minimum shareholding of £`[250]`; board admits.
- Exclusions: political parties, candidates' campaigns, and bodies whose main purpose is lobbying for a party, cannot be partner members. Public authorities whose office-holders are scored by the society's tools cannot be partner members. **[SOL]** Check the exclusion is lawful and clear.

### 4.4 General
- A person may belong to only one class. Where someone qualifies for two (a worker who is also a reader), they sit in the worker class.
- Members must notify a change of class eligibility. The board moves members between classes under a written policy.
- Membership ends on: withdrawal of all shares; death or dissolution; expulsion; ceasing to qualify for any class.
- Expulsion by special resolution of the board with a right to be heard and to appeal to a general meeting. **[CUK]** Use model wording.

## 5. Voting

### 5.1 General meetings
- One member, one vote, regardless of shareholding.
- **Weighted class voting** at general meetings: workers `[50]`%, readers `[30]`%, partners `[20]`% of the total vote, whatever the number of members in each class. Votes within each class are counted and then scaled.
- **[CUK]** Weighted voting between classes is used in multi-stakeholder model rules, but confirm the exact weights are acceptable and that a worker class of three members holding 50% passes the co-operative condition while membership grows.
- Quorum: `[10]`% of members or `[20]` members, whichever is lower, including at least one member of each class.

### 5.2 Board
- Board of 5 to 9 directors:
  - worker directors: a majority, elected by worker members;
  - reader directors: at least 1 (at least 2 when the board has 7 or more), elected by reader members;
  - partner directors: at least 1, elected by partner members;
  - up to 2 co-opted independent directors (no vote on reserved worker matters).
- Terms of `[3]` years, rotating; maximum `[3]` consecutive terms for non-worker directors.
- Chair elected by the board. **Suggest:** chair may not be a worker director, to give readers and partners a visible role.

### 5.3 Reserved matters
- **Worker matters** (decided by worker directors / worker members): staffing, pay within the board-approved budget, day-to-day editorial decisions, product roadmap.
- **All-class consent matters** (need a majority of each class, by separate class vote at a general meeting):
  - changing the objects;
  - changing the asset lock (and see 9.4);
  - changing the editorial independence clause (clause 10);
  - setting the maximum share interest rate;
  - dissolution, amalgamation, transfer of engagements, conversion.
- **[SOL]** Make sure class consent sits alongside, not instead of, the statutory special resolution requirements.

## 6. Share capital

- 6.1 **Shares are withdrawable and not transferable**, except on death or bankruptcy as the Act allows ([RFCCBS 6.1.12–6.1.13](https://handbook.fca.org.uk/handbook/RFCCBS/6/1.html)).
- 6.2 Nominal value £1 per share.
- 6.3 **Minimum shareholding:** worker £`[1]`; reader £`[25]`; partner £`[250]`.
- 6.4 **Maximum holding:** £`[25,000]` per member, below the statutory limit of £100,000 ([s.24 of the 2014 Act](https://www.legislation.gov.uk/ukpga/2014/14/section/24); [RFCCBS 6.1.8](https://handbook.fca.org.uk/handbook/RFCCBS/6/1.html)). Societies investing as partners, and Community Shares ICOF as a match investor, may hold up to the amount agreed by the board. **[CUK]** Check whether the cap needs a separate carve-out for the institutional match investor.
- 6.5 **Withdrawal:** by written notice of `[3]` months. No withdrawals for the first `[3]` years after shares are issued in a share offer, unless the board agrees (death, hardship). After that, withdrawals are paid from surplus or new share capital, within an annual limit the board sets.
- 6.6 **Board power to suspend withdrawals** where paying them would harm the society's ability to pay its debts or meet its objects ([RFCCBS 6.1.9–6.1.11](https://handbook.fca.org.uk/handbook/RFCCBS/6/1.html)).
- 6.7 **No capital gain:** shares can only ever be withdrawn at or below nominal value. The board may reduce share value if the society's losses require it. **[CUK]** Use model wording on share value reduction.
- 6.8 **Interest:**
  - Interest may be paid on shares, but only where the society can afford it, and at no more than the rate sufficient to attract and keep the capital needed ([RFCCBS 6.1.21–6.1.25](https://handbook.fca.org.uk/handbook/RFCCBS/6/1.html)).
  - Maximum rate: `[3]`% a year, or `[2]`% above Bank of England base rate if lower. Set in advance by the board and confirmed by all-class consent.
  - Interest is not cumulative: a missed year is not made up later.
  - Interest is not a share of profits. There is no dividend on shares.
- 6.9 **Surplus:** applied, in order, to reserves; developing the society's work; a patronage or worker bonus within limits the members set; and donations to bodies with similar objects. **[CUK]** Whether a worker bonus is compatible with the asset lock wording below, and whether we want it at all.

## 7. Borrowing

- Model wording. Board may borrow up to `[£50,000]` without general meeting approval.

## 8. Directors' duties and conflicts of interest

- 8.1 Directors must declare any personal, financial or organisational interest in any matter before the board and leave the discussion and vote unless the board decides otherwise and minutes why.
- 8.2 The society keeps a **public register of interests** for directors and senior staff, updated within `[28]` days of any change.
- 8.3 **Specific conflicts for this society:**
  - Directors and staff who are members of, employed by, donors to or candidates for a political party must declare it.
  - A partner director whose body is the subject of a claim or pledge being scored must not take part in decisions on that coverage.
  - Directors and staff must declare any relationship with a funder or programme the society has applied to (see [04-governance-policies.md](04-governance-policies.md)).
- 8.4 No director may be paid as a director, other than reasonable expenses, except worker directors in their capacity as workers. **[CUK]**

## 9. Asset lock

Draft wording, adapted for a co-operative society (we cannot use the statutory CBS wording; see [01-conversion-options.md](01-conversion-options.md)). **[SOL] [CUK]**

> 9.1 The assets of the society are held for the purposes of its objects and shall not be distributed to members, directly or indirectly, except:
> (a) payment of the nominal value of shares on withdrawal, and interest on shares under rule 6.8;
> (b) payment for work done or goods or services supplied at market rates;
> (c) reasonable expenses.
>
> 9.2 The society's reserves are indivisible. No member has any claim on them, either while the society exists or on dissolution.
>
> 9.3 The society may not transfer its engagements to, amalgamate with, or convert into, any body that does not have an asset lock at least as strong as this rule and objects broadly similar to the society's.
>
> 9.4 This rule, rule 10 and rule 13 may only be amended by a resolution that: (a) is passed as a special resolution at a general meeting; (b) receives the consent of a majority of each member class voting separately; and (c) has the prior written consent of the Asset Guardian.
>
> 9.5 The Asset Guardian is `[Co-operatives UK / another named asset-locked body]` or such other asset-locked body as it nominates.

- **[SOL]** Whether 9.4(c), requiring consent from an outside body, is enforceable in a co-operative's rules and acceptable to the FCA.
- **[CUK]** Whether Co-operatives UK will act as Asset Guardian, and its conditions.

## 10. Editorial independence

> 10.1 The society's editorial, scoring and methodology decisions are made by the editorial team under a published editorial policy. No member, member class, director (in their capacity as director), funder, partner or investor may direct or veto the content of any published record, score or article.
>
> 10.2 The board's role is to approve the editorial policy, appoint and remove the editor, and ensure the policy is followed. It may not overturn an individual editorial decision.
>
> 10.3 Holding shares, providing funding or being a partner member gives no right to influence coverage. Every published record discloses relevant funding and partner relationships under the declared-interest policy.
>
> 10.4 Complaints about accuracy go through the published corrections process, with right of appeal to an external reviewer.

- **[SOL]** Make sure 10.2 does not conflict with directors' statutory duties (e.g. legal risk on defamation; the board must be able to act on legal advice to remove or amend content).
- Detail in [04-governance-policies.md](04-governance-policies.md).

## 11. Meetings, notices and records

- AGM within `[6]` months of the year end (financial year ends 1 April).
- Notice: `[14]` clear days, by email and on the website. Electronic and hybrid meetings allowed; online voting allowed. **[CUK]** Model wording on electronic meetings.
- Annual return and accounts filed with the FCA. Accounts audited or reported on as the Act requires; members may vote to disapply audit where allowed. **[CUK]**

## 12. Disputes

- Model wording: disputes between a member and the society go to mediation, then to arbitration or the courts as the model rules provide.

## 13. Dissolution

> 13.1 The society may be dissolved by instrument of dissolution or by winding up under the Act, subject to rule 5.3 (all-class consent).
>
> 13.2 On dissolution, after paying debts and repaying share capital at no more than nominal value, any remaining assets shall be transferred to the Asset Guardian, or to another body with an asset lock and objects similar to the society's chosen by the members, and shall not be distributed to members.

- **[SOL]** Confirm the instrument of dissolution route under the Act, and that 13.2 binds a liquidator.

## 14. Amendment of rules

- Rules may be amended by special resolution, subject to rule 9.4 for entrenched rules. No amendment takes effect until registered by the FCA.

---

## Summary of checks

| Clause | Check | With |
|---|---|---|
| 2 Objects | Co-operative condition with public-benefit objects | CUK |
| 3.2 Token exclusion | Clear, enforceable wording | SOL |
| 4.2 Reader members | Mutual relationship for a free service | CUK |
| 4.3 Partner exclusions | Lawful, clear | SOL |
| 5.1 Weighted voting | Weights acceptable; small worker class | CUK |
| 5.3 Reserved matters | Fits with statutory special resolution | SOL |
| 6.4 Max holding | Carve-out for institutional investor | CUK |
| 6.7 Share value reduction | Model wording | CUK |
| 6.9 Surplus / worker bonus | Compatible with lock | CUK |
| 8.4 Director pay | Model wording | CUK |
| 9 Asset lock | Enforceability of entrenchment and Asset Guardian consent | SOL, CUK |
| 10 Editorial | Compatibility with directors' duties | SOL |
| 11 Meetings | Electronic meetings, audit exemption | CUK |
| 13 Dissolution | Binds liquidator | SOL |
