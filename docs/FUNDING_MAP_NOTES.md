# Funding Map — Source Scout Notes

Scout + scaffold for the Claim Ledger funding module (`docs/CLAIM_LEDGER_SPEC.md`,
§Funding module). Rule of the module, restated because it shapes every decision
below: **every edge IS a document link; registry-based only; no inferred edges;
absence of data is a registry gap, never suspicion.**

All probes run 2026-07-11 with plain `curl`, no credentials.

Scaffolded fetchers (typed, no persistence, no UI):

- `web/src/lib/funding/types.ts` — `FundingEdge`, `FundingParty`, `.NET` date parser
- `web/src/lib/funding/electoral-commission.ts` — donations register (live, no auth)
- `web/src/lib/funding/members-interests.ts` — Register of Members' Financial Interests (live, no auth)

---

## 1. Electoral Commission donations register — LIVE, no auth ✅

The Commission's search UI at `search.electoralcommission.org.uk` is backed by a
public JSON API. No key, no auth, no rate-limit headers observed (IIS behind the
Commission's own host; be polite — this is their UI backend, not a documented
public API, so shapes could change without notice).

### Verified endpoint

```
GET https://search.electoralcommission.org.uk/api/search/Donations
```

Verified query params:

| Param | Meaning | Verified example |
|---|---|---|
| `query` | full-text over donor + recipient names | `query=Bamford` → 221 results |
| `start`, `rows` | paging | `start=0&rows=25` |
| `sort`, `order` | `sort=AcceptedDate&order=desc` | works |
| `date=Accepted&from=YYYY-MM-DD&to=YYYY-MM-DD` | accepted-date window | `date=Accepted&from=2026-01-01&to=2026-03-31` → 826 results |
| `et` | recipient entity type | `pp`=political party (79,391), `rd`=regulated donee incl. MPs/mayors/members assocs (10,436), `tp`=third party (385), `perpar`=permitted participant (1,026) |
| `register` | `gb` / `ni` register | `register=gb` works |

**Gotcha:** `from`/`to` are silently ignored unless `date=Accepted` (or another
date-kind value) is also passed — totals stay at the unfiltered ~93k. The
fetcher sets `date=Accepted` automatically.

### Sample (trimmed)

```
GET .../api/search/Donations?start=0&rows=1&query=Bamford&sort=AcceptedDate&order=desc
```

```json
{
  "Total": 221,
  "Result": [{
    "ECRef": "C0838114",
    "DonorName": "J C Bamford Excavators Ltd",
    "DonorStatus": "Company",
    "CompanyRegistrationNumber": "00561597",
    "RegulatedEntityName": "Conservative and Unionist Party",
    "RegulatedEntityType": "Political Party",
    "Value": 5000.0,
    "DonationType": "Cash",
    "AcceptedDate": "/Date(1774998000000)/",
    "ReceivedDate": "/Date(1773619200000)/",
    "ReportingPeriodName": "Q1 2026",
    "IsSponsorship": false,
    "AccountingUnitName": "Central Party"
  }]
}
```

Notes:

- Dates are .NET-style `/Date(ms)/` — parsed by `parseDotNetDate()` in `types.ts`.
- `CompanyRegistrationNumber` is a **Companies House number stated in the register
  itself** — a registry-given join key to the companies graph, no inference needed.
- Per-record public document page (the edge's `sourceUrl`):
  `https://search.electoralcommission.org.uk/English/Donations/{ECRef}` (verified 200).
- CSV export also exists: `GET /api/csv/Donations?...` same params (verified 200,
  `text/csv`) — useful later for bulk backfill.

## 2. Register of Members' Financial Interests — LIVE, no auth ✅

Parliament serves the register through a proper documented API.

- Swagger UI: `https://interests-api.parliament.uk/index.html`
- Swagger JSON: `https://interests-api.parliament.uk/swagger/v1/swagger.json`
- Behind Cloudflare; no rate-limit headers observed.

### Verified endpoints

| Endpoint | Purpose | Verified |
|---|---|---|
| `GET /api/v1/Categories?Take=50` | category tree (12 top-level for Commons: employment, donations, gifts, visits, shareholdings, land, family…) | ✅ |
| `GET /api/v1/Interests?MemberId={id}&Take=&Skip=` | interests by canonical Parliament Member ID | ✅ (MemberId=4514 → 16 items) |
| `GET /api/v1/Interests/{id}` | single interest | ✅ (id=15194 → 200) |
| `GET /api/v1/Interests/csv?...` | CSV export, same filters | in swagger, not probed |
| `GET /api/v1/Registers` | published register editions (per session) | in swagger, not probed |

Additional `Interests` filters from swagger: `CategoryId`, `PublishedFrom/To`,
`RegisteredFrom/To`, `UpdatedFrom/To`, `RegisterId`, `ExpandChildInterests`, `SortOrder`.

### Sample (trimmed)

```
GET https://interests-api.parliament.uk/api/v1/Interests?MemberId=4514&Take=2
```

```json
{
  "totalResults": 16,
  "items": [{
    "id": 15194,
    "summary": "The Arsenal Football Club Limited - £1,000.00",
    "registrationDate": "2026-05-08",
    "publishedDate": "2026-05-08",
    "category": { "id": 4, "number": "3", "name": "Gifts, benefits and hospitality from UK sources" },
    "member": { "id": 4514, "nameDisplayAs": "Sir Keir Starmer", "party": "Labour", "house": "Commons" },
    "fields": [
      { "name": "Value", "type": "Decimal", "typeInfo": { "currencyCode": "GBP" }, "value": "1000.00" },
      { "name": "ReceivedDate", "type": "DateOnly", "value": "2026-05-02" },
      { "name": "DonorName", "type": "String", "value": "The Arsenal Football Club Limited" },
      { "name": "DonorStatus", "type": "String", "value": "Company" },
      { "name": "DonorCompanyIdentifier", "type": "String", "value": "00109244" },
      { "name": "DonorCompanyIdentifierSource", "type": "String", "value": "Companies House" }
    ],
    "rectified": false
  }]
}
```

Notes:

- `fields[]` is category-specific; the fetcher keeps all fields verbatim plus
  convenience extracts (`donorName`, `valueGbp`, `donorCompanyNumber`, …).
- `DonorCompanyIdentifier` + `DonorCompanyIdentifierSource: "Companies House"` is
  the second registry-given join key to Companies House. Both money edges into the
  companies graph come from the registries themselves — zero inference.
- `member.id` IS the canonical Parliament Member ID (`members-api.parliament.uk`)
  — same key the ledger `entities` table uses. Direct join, no name matching.
- Document URLs: member's public register page
  `https://members.parliament.uk/member/{id}/registeredinterests` (human) and
  `https://interests-api.parliament.uk/api/v1/Interests/{id}` (machine).
- Entries with no stated counterparty (shareholdings, land) do **not** become
  edges — `interestToEdge()` returns `null` for them rather than inventing a
  counterparty. They can render as node annotations later, still document-linked.

## 3. Companies House — BLOCKED without key (free key available) 🔑

```
GET https://api.company-information.service.gov.uk/company/00109244  → 401
```

- Requires a free API key (register at developer.company-information.service.gov.uk),
  sent as HTTP Basic username. Not attempted per task constraints.
- Relevant endpoints for the map (documented): `GET /company/{number}`,
  `GET /company/{number}/officers`, `GET /company/{number}/persons-with-significant-control`,
  `GET /search/companies`. Documented rate limit: 600 requests / 5 minutes.
- Both live registries above hand us company numbers directly
  (`CompanyRegistrationNumber`, `DonorCompanyIdentifier`), so Companies House is
  purely an enrichment hop — the donor→recipient edges ship without it.
- No fetcher scaffolded (auth required). When keyed: `COMPANIES_HOUSE_API_KEY`
  env var, same fetcher pattern, and note officers/PSC links are themselves
  registry documents (each officer appointment has a public CH page → valid edge).

## 4. Contracts Finder — LIVE, no auth ✅ (probe only, no fetcher yet)

```
GET https://www.contractsfinder.service.gov.uk/Published/Notices/OCDS/Search?stages=award&limit=1  → 200
```

- Standard OCDS release packages: `{ releases: [{ ocid, tag: ["award"], buyer,
  tender: { title, value: { amount, currency } }, awards: [...] }] }`.
- Each release has an `ocid` and a public notice page — valid document links.
- Feasible with the same fetcher pattern. Deferred: the money-map join
  (supplier company number → CH → donor) is a **two-document chain**, both hops
  registry-stated, but it needs the Companies House key first to be useful.

## 5. Ministerial meetings / gifts / hospitality — FEASIBLE BUT MESSY ⚠️

- No unified API. Departments publish quarterly transparency returns as CSV/ODS
  attachments on GOV.UK.
- Discovery works via the GOV.UK search API (verified):
  `GET https://www.gov.uk/api/search.json?q=ministerial+meetings&filter_content_store_document_type=transparency&count=3`
  → 200, 5,429 results (each with `link` to a publication page whose attachments
  are the CSVs).
- Building this = per-department CSV ingestion with inconsistent column names.
  Each row's document link is the publication attachment URL — spec-compliant,
  but it's an ETL project, not a fetcher. Recommend last in build order.

---

## Proposed v1 data model

Honours the spec: an edge exists **iff** a registry document states it.

### Entities (nodes)

| Entity | Key | Source of identity |
|---|---|---|
| `member` | Parliament Member ID | members-api (already in ledger `entities`) |
| `party` / `donee` | EC RegulatedEntityId + name | EC register |
| `donor` | EC DonorId / interests DonorName (+ company number when stated) | EC / RMFI |
| `company` | Companies House number | CH (numbers supplied BY the registries) |

Node merging rule: two nodes merge only on a registry-given key (same Companies
House number, same Parliament Member ID, same EC DonorId). **Never on name
similarity** — fuzzy name matching is an inferred edge by the back door.

### Edges

One shape (implemented as `FundingEdge` in `web/src/lib/funding/types.ts`):

```
edge = {
  source_url      — the registry document (required, non-nullable, ever)
  document_kind   — electoral_commission_donation | members_interest
                    | contract_award | ministerial_meeting
  from, to        — parties as stated in the document (name + verbatim role
                    + registry keys when the document provides them)
  amount_gbp?     — only if the document states a value
  date            — the document's own date (accepted/received/registered)
  registry_ref    — ECRef / interest id / OCID
  description?    — register's own summary text
}
```

Gap handling: a missing amount/date renders as "not stated in register", with the
`source_url` still pointing at the document that omits it. No edge is ever drawn
because two names look alike or because money "probably" flowed.

## Rate-limit observations

- EC API: no rate-limit headers; IIS; UI backend — throttle ourselves (≤1 rps,
  cache 1h via `next.revalidate`).
- interests-api: Cloudflare, no limit headers; official API, still cache 1h
  (categories 24h).
- Companies House (documented): 600 req / 5 min per key.
- Contracts Finder OCDS: no limits observed on light probing.

## Recommended build order

1. **members-interests.ts** (done, scaffolded) — official API, canonical member
   IDs, joins straight onto the existing ledger `entities` table. Cheapest win.
2. **electoral-commission.ts** (done, scaffolded) — party + donee edges;
   `et=rd` covers MPs/mayors directly. Add CSV bulk backfill later.
3. **Companies House enrichment** — get the free key, add `companies.ts`
   (company profile + officers + PSC), joining ONLY on registry-supplied
   company numbers from steps 1–2.
4. **Contracts Finder** — `contracts.ts` on the OCDS endpoint; valuable once CH
   supplies supplier identity.
5. **Ministerial meetings** — GOV.UK transparency CSV ETL; highest effort,
   lowest structure; last.
