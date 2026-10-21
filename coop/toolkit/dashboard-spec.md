# Public dashboard: co-ops supported by the programme

**Status:** specification, draft 20 October 2026. Not yet built.
**Owner:** Morality Co-operative Ltd, on behalf of the strategic authority.
**Audience:** authority officers, councillors, residents, journalists, MHCLG, Co-operatives UK.

## Purpose

Show, in one public place, every co-operative the Co-operative Development Programme helps in the authority's area: what it is, what it received, and whether it is still trading years later.

Most small-grant programmes report outputs at the end of the grant and then stop looking. The useful question is survival, so the dashboard keeps checking at one, three and five years after award.

## What is shown

### One row per supported co-op

| Field | Example | Notes |
|---|---|---|
| Name | Example Village Shop Ltd (illustrative) | As registered with the FCA |
| FCA registration no. | 12345 | Links to the FCA Mutuals Public Register |
| Type | Community benefit society | Co-op society / BenCom / other (stated) |
| Sector | Pub · Shop · Café · Workspace · Care · Energy · Other | One primary sector |
| Area | Lewes district, East Sussex | District or unitary council area, plus ward. Never a street address unless it is a public trading premises |
| Stage | Enquiry → Steering group → Registered → Share offer → Trading → Closed | With date entered each stage |
| Money awarded | £18,500 | Programme money only, by date and purpose |
| Other money raised | £142,000 (community shares £96,000; loans £46,000) | Self-reported, marked as such |
| Jobs | 2.5 FTE paid; 30 volunteers | Paid FTE and volunteer headcount reported separately |
| Members | 412 | Count only |
| Trading at 1 year | Yes | Yes / No / Not yet due |
| Trading at 3 years | Not yet due | |
| Trading at 5 years | Not yet due | |
| Last verified | 2027-03-14 | Date and method of last check |

### Programme totals

Total awarded; number of co-ops at each stage; total members; total paid jobs; survival rate at 1/3/5 years (with the number of co-ops each rate is based on); money awarded per surviving co-op.

### Views

- Table (sortable, filterable by area, sector, stage, year)
- Map at district level only
- A page per co-op with its timeline and every award
- CSV and JSON download of the full dataset, under the Open Government Licence or CC BY 4.0

## Data sources

| Data | Source | How often |
|---|---|---|
| Name, number, type, registration status | FCA Mutuals Public Register | Monthly automatic check |
| Annual return filed / overdue | FCA Mutuals Public Register | Monthly |
| Awards and payments | Authority grant records (finance system or award letters) | On each payment |
| Stage | Programme adviser records, confirmed by the co-op | On each change |
| Members, jobs, other money raised | Annual self-report from the co-op (short form) | Yearly; cross-checked against FCA annual return where possible |
| Still trading at 1/3/5 years | FCA register status + co-op confirmation + public evidence (premises open, licence current) | On each anniversary of first award |
| Sector-wide comparison | Co-operatives UK, Co-op Economy report | Yearly |

Each value records its source and the date it was last checked. Self-reported figures are labelled as self-reported.

## Privacy rules

1. **No personal data about members or shareholders is published.** Member numbers are counts only. The register of members is the co-op's, not ours.
2. **Board members and officers** are named only where they are already public on the FCA register, and only by name and role.
3. **Small numbers are suppressed.** Any count below 5 in a filtered or area view (for example "jobs in ward X") is shown as "fewer than 5". Totals are rounded to avoid back-calculating suppressed cells.
4. **Pay is never published per person.** Jobs are shown as FTE totals.
5. **No location below ward level** except a public trading premises.
6. **Enquiries are not published** until a group has formed a steering group and agreed to be listed. Groups that drop out before registration are counted in aggregate only.
7. **No tracking.** The dashboard uses no third-party analytics, advertising scripts or cookies beyond what is strictly needed. Server logs are kept for no more than 30 days.
8. **Co-ops see their own row first.** Each co-op is sent its row 10 working days before any change is published and can correct factual errors. It cannot veto accurate information about public money.
9. A **data protection impact assessment** is completed with the authority before launch. The authority is controller for grant data; Morality is processor under a written agreement.

## Corrections and history

- Nothing is silently overwritten. Every change creates a new version with date, reason and who made it.
- Corrections are listed on a public corrections page and linked to the pooter.world corrections register.

## How it plugs into the pooter.world Pledge Ledger

The Pledge Ledger records public commitments and whether they were kept. The programme's awards are commitments of public money with stated outcomes, so they fit the same model.

Note: the Pledge Ledger is being built in parallel (branch `feat/pledge-ledger`). The mapping below is the proposed interface and should be aligned with that work before either is finalised.

### Mapping

| Dashboard event | Pledge Ledger record |
|---|---|
| Award agreed | **Pledge**: maker = authority; subject = co-op (FCA no.); amount; purpose; due outcomes (registered by date X; trading by date Y) |
| Payment made | **Fulfilment** against the pledge: amount, date, evidence reference |
| Stage reached | **Milestone** on the pledge |
| 1/3/5-year check | **Outcome check**: trading yes/no, method, date, evidence |
| Correction | **Amendment** linking to the record it corrects; the original stays visible |

### Proposed record (JSON)

```json
{
  "schema": "pooter.pledge/coop-programme/v0",
  "id": "sbsa-cdp-2027-0007",
  "maker": { "name": "Sussex and Brighton Strategic Authority", "type": "strategic-authority" },
  "subject": { "name": "Example Community Pub Ltd", "fcaNumber": "12345", "type": "bencom", "sector": "pub", "area": "Mid Sussex" },
  "kind": "award",
  "amountGBP": 18500,
  "purpose": "Share-offer preparation and Standard Mark assessment",
  "outcomes": [
    { "key": "registered", "due": "2027-06-30" },
    { "key": "trading-1y", "due": "2028-04-01" },
    { "key": "trading-3y", "due": "2030-04-01" },
    { "key": "trading-5y", "due": "2032-04-01" }
  ],
  "evidence": [{ "type": "award-letter", "ref": "SBSA/CDP/0007" }],
  "recordedAt": "2027-04-01T09:00:00Z",
  "supersedes": null
}
```

### Integrity

- Records are append-only.
- Each day's new and amended records are hashed into a Merkle tree and the root is published on Base through the existing pooter.world `LedgerAnchor` contract, as the Claim Ledger already does. Anyone can check a downloaded record against the published root.
- No personal data goes into anchored records. Only the hash goes on-chain.
- The on-chain anchor is a tamper-evidence measure, not a payment system. No tokens are involved and no one needs a crypto wallet to read the dashboard.

## Build notes

- Static, server-rendered pages; works without JavaScript; accessible to WCAG 2.2 AA.
- Hosted alongside pooter.world, with the data also published as a plain file the authority can mirror on its own site.
- Estimated build: placeholder [£X] and [N] weeks; running cost placeholder [£X] per year (see pilot proposal).

## Open questions

- Will MHCLG specify its own reporting fields? If so, the dashboard should adopt them rather than invent parallel ones.
- Will Co-operatives UK run a national dashboard? If so, this should feed it rather than compete with it.
- Who in the authority signs off publication of grant data?
