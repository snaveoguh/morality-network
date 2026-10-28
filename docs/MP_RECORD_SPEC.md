# MP Record — Spec v0.1

**One-liner:** one record per Member of Parliament: who they are, what they have claimed
(from the Claim Ledger), and what the official registers say about their money, interests
and ties. Every number on it can be traced to a register entry, reproduced from our stored
copy of that entry, and cited.

**Bar to clear:** Commons Library grade. A researcher, a journalist or an MP's office can
quote "pooter world MP Record" in the House, and a hostile reader who checks the figure gets
the same answer from the same documents. If a number cannot survive that, it does not ship.

> **LAUNCH GATE — open.** The MP Record must not be public until a media solicitor has
> reviewed the page template, the stat methodology and this document, and signed off in
> writing. Until then production returns 404 for `/mp/*` and `/api/mp/*` unless
> `MP_RECORD_PREVIEW=true` plus the preview token (staging only), and every page shows a "pending legal review"
> banner and carries `noindex`. Sign-off is recorded by setting `MP_RECORD_LEGAL_SIGNOFF` to
> the sign-off reference (e.g. `2026-11-14 Smith & Co ref 1234`) — see §Launch gate.

---

## 1. Principles (non-negotiable)

These extend the Claim Ledger principles (`docs/CLAIM_LEDGER_SPEC.md`).

1. **Official registers only.** A fact appears on the record only if an official register
   states it: the Parliament Members API, the Register of Members' Financial Interests, the
   Electoral Commission register, Companies House, the Register of All-Party Parliamentary
   Groups. Nothing is scraped from the press, nothing is crowd-sourced.
2. **The register's own words.** Summaries, categories, donor names, donor status, job
   titles and descriptions are shown verbatim. We never paraphrase a register entry.
   Normalisation is limited to data types (dates to ISO, money to exact decimals).
3. **No characterisation.** No scores, rankings, "conflict of interest" labels, "red flags",
   "links to", sentiment, or adjectives. No juxtaposition designed to imply wrongdoing
   (e.g. a donor beside a vote). The record shows what was registered, when, and where.
4. **Absence is absence.** A missing field is a gap in the register, rendered as "not stated
   in the register". An entry that disappears from a register is shown as "no longer in the
   register as of <date>", never as "deleted" or "hidden".
5. **No LLM in the facts path.** Ingest, parsing, versioning, stats and rendering are
   deterministic code. An LLM may *propose* an entity match (e.g. a Companies House officer
   to an MP) into the review queue; it can never confirm one, and nothing it proposes is
   visible to the public.
6. **Reproducible or not published.** Every stat is a pure function of stored register
   versions and an "as of" date. The same permalink returns the same number forever.
7. **Corrections are loud.** Errors are corrected publicly in a per-MP and site-wide
   corrections log. Nothing is silently changed.

## 2. Identity

The canonical key is the **Parliament Members API `member_id`** (`members-api.parliament.uk`),
the same key `pooter.ledger_claims.member_id` carries. Every MP Record table is keyed on it.

Registers that do not carry `member_id` (Electoral Commission, Companies House, APPGs) are
joined only through `pooter.mp_source_links`, a reviewed mapping (§6).

## 3. Sources

| Source | Endpoint | Auth | What we take | Licence | Status |
|---|---|---|---|---|---|
| Parliament Members API | `https://members-api.parliament.uk/api/Members/{id}` and `/Biography` | none | names, house, current party/seat, party history, constituency history, government/opposition/other posts, committee memberships, all with dates | Open Parliament Licence | **built** |
| Register of Members' Financial Interests | `https://interests-api.parliament.uk/api/v1/Interests?MemberId={id}&ExpandChildInterests=true` | none | every registered interest and its child payments, with the register's category, summary, fields, registration/published/updated dates, rectification | Open Parliament Licence | **built** |
| Electoral Commission donations register | `https://search.electoralcommission.org.uk/api/csv/Donations` (the "Export" behind the public search) | none | donations to the MP as a *regulated donee* (`RegulatedDoneeType = MP - Member of Parliament`) | Open Government Licence | **built** (links need review) |
| Companies House officers | `https://api.company-information.service.gov.uk/search/officers`, `/officers/{id}/appointments` | free API key | officer appointments: company, role, appointed/resigned | Open Government Licence | **stub** — needs an API key |
| Register of All-Party Parliamentary Groups | `https://publications.parliament.uk/pa/cm/cmallparty/` (published editions) | none | group name, officer role, register edition date | Open Parliament Licence | **stub** — HTML register, parser not written |

Known source limitations (checked 2026-10-28), shown as gaps, never filled in:

- The Interests API returns `Donors` and `VisitLocations` as `null` for category 4
  (visits outside the UK), on both list and single-record endpoints. Visits therefore carry
  no donor or value in our data; the register's summary (destination and dates) is kept.
- The Electoral Commission export truncates `PurposeOfVisit` at about 250 characters (the
  JSON search API returns the same truncated text). We store and show it as published.
- The Interests API counts child payments in `totalResults` only when
  `ExpandChildInterests=false`; we fetch expanded and check completeness against the
  top-level count.

Not used: TheyWorkForYou (secondary), Wikipedia/Wikidata (not a register), press reports,
the Members API "Synopsis" endpoint (generated prose, not a register entry).

### Rate limits and politeness

All ingesters go through one fetcher (`web/src/lib/mp-record/http.ts`): at most one request
per `MP_INGEST_MIN_INTERVAL_MS` (default 500 ms) per host, retry with exponential backoff on
429/5xx/network errors (max 4 attempts), a `User-Agent` naming pooter.world and a contact
address, and a hard timeout. Nothing runs concurrently against the same host.

## 4. Data model

Migration `web/migrations/014_mp_record.sql`. All tables live in the `pooter` schema.

### 4.1 Provenance columns (every fact row)

| column | meaning |
|---|---|
| `source_url` | the human-readable public page for this entry (what a reader clicks) |
| `source_api_url` | the machine endpoint we fetched it from |
| `source_record_id` | the register's own ID for the entry (interest id, ECRef, `party:4:2015-05-07`, …) |
| `retrieved_at` | when we fetched the response this version was parsed from |
| `content_hash` | `sha256` of the canonical JSON of the normalised record (§4.3) |
| `raw_fetch_id` | FK to `mp_raw_fetches`, the exact bytes we parsed |
| `version` | 1, 2, 3 … per `(member_id, source_record_id)` |
| `is_removed` | `true` on a tombstone: the entry was absent from a complete fetch |
| `parser_version` | parser that produced the row (e.g. `interests-v1`) |

### 4.2 Tables

- `mp_raw_fetches` — every API response body, verbatim, with URL, HTTP status, content type,
  `sha256` of the body and fetch time. Identical bodies for the same URL are stored once
  (`first_seen_at`, `last_seen_at`, `seen_count`). Audit trail: any stored fact can be
  re-derived from these bytes.
- `mp_ingest_runs` — one row per ingest run: source, parameters, start/end, status, counts,
  and a `cursor` (JSON) so an interrupted run resumes where it stopped.
- `mp_source_checks` — one row per (member, source, run) recording that we completed a full
  fetch of that member from that source at that time and how many records it returned. This
  is what an "as of" date means: the last complete check at or before it.
- `mp_members` — versioned identity: display/list/full-title names, gender, house, current
  party, current constituency, membership start/end and status.
- `mp_member_periods` — versioned dated facts from the Biography endpoint, one row per
  period: `kind` ∈ `party | constituency | house | government_post | opposition_post |
  other_post | committee`, `name`, `org_id`, `start_date`, `end_date`, `additional_info`.
- `mp_interests` — versioned Register of Interests entries, parent and child rows flattened
  (`parent_interest_id` links a payment to its employment entry). Holds the register's
  category id/number/name, `summary` verbatim, `payer_or_donor_name`, `value_gbp`
  (exact `NUMERIC`), `value_currency`, `received_date`, `registration_date`,
  `published_date`, `updated_dates`, `rectified`, `rectified_details`, and the full `fields`
  array verbatim.
- `mp_donations` — versioned Electoral Commission rows keyed by `ECRef`, with the
  regulated entity id/name, donor name/status, company number, value, cash/non-cash split,
  donation type, nature/purpose verbatim, accepted/received/reported dates and reporting
  period. Not keyed on `member_id`: they belong to an MP only through a confirmed
  `mp_source_links` row.
- `mp_directorships` — versioned Companies House appointments keyed by
  `officer_id:company_number:appointed_on:role`. Belong to an MP only through a confirmed link.
- `mp_appgs` — versioned APPG officer rows keyed by `edition:group:role`.
- `mp_source_links` — the reviewed mapping from an external identity (EC regulated entity,
  CH officer, APPG name string) to a `member_id`, with `match_method`, `match_evidence`
  (JSON), `confidence` (`high | medium | low`), `proposed_by` (`rule:<name>` or
  `llm:<model>`), `status` (`proposed | confirmed | rejected`), `reviewed_by`, `reviewed_at`.
  Every status change is appended to `mp_source_link_reviews`.
- `mp_corrections` — the corrections log (§9).
- `mp_replies` — right-of-reply submissions (§8).

Views:

- `mp_*_current` — the latest version of each entry, tombstones excluded.
- `mp_donations_public`, `mp_directorships_public` — current rows joined through *confirmed*
  links only. The read API and the page read only these.
- `mp_ties` — one row per tie: `member_id`, `tie_type`, `counterparty_name`,
  `counterparty_kind` (`organisation | person | unknown` — taken from the register's own
  status field, never inferred), `value_gbp`, `period_start`, `period_end`, `source_url`,
  `source_record_id`, `source_table`, `retrieved_at`, `content_hash`. Built only from the
  public views.

### 4.3 Content hash

`content_hash = sha256(canonicalJson(record))` where `canonicalJson` sorts object keys
recursively, keeps array order, drops `undefined`, and serialises numbers as JSON does.
Money is carried as a decimal *string* (`"5950.00"`) so the hash never depends on float
formatting. Provenance fields (`retrieved_at`, `raw_fetch_id`, URLs) are excluded, so the
hash changes only when the register's content changes. The recipe is versioned
(`HASH_RECIPE = "mp-record-hash-v1"`); changing it requires a new version and a re-hash
migration, never a silent change.

### 4.4 Append-only versioning

Fact rows are immutable. A trigger (`pooter.mp_forbid_mutation`) rejects `UPDATE` and
`DELETE` on every versioned table. On each complete fetch of a member from a source, the
deterministic differ (`web/src/lib/mp-record/versioning.ts`) compares the fresh records
with the current versions:

- new `source_record_id` → insert version 1
- same id, different `content_hash` → insert version n+1 (the old row stays)
- same id, same hash → nothing (re-runs are no-ops)
- id present in the current versions but absent from the fetch → insert a tombstone
  (`is_removed = true`), **only if the fetch was complete** (every page returned 2xx and the
  page count matched the API's `totalResults`). A partial fetch never removes anything.
- an id that comes back after a tombstone → new version with `is_removed = false`

So the record can always say *when an entry first appeared, when it changed and when it
left the register*, and a stat can be recomputed for any past date.

## 5. Ingest

Code: `web/src/lib/mp-record/` (pure parsers, differ, stats, orchestrator) and
`web/src/lib/db/mp-record.ts` (Postgres store). CLI: `web/scripts/mp-ingest.ts`.

```
npm run mp:ingest -- --members 5028,5122,4366             # Members + Interests + EC
npm run mp:ingest -- --all-current                         # every current MP
npm run mp:ingest -- --members 4366 --sources interests    # one source
npm run mp:ingest -- --resume <runId>                      # continue an interrupted run
npm run mp:ingest -- --members 4366 --dry-run              # in-memory store, prints a report
```

Properties: **idempotent** (diffing makes re-runs no-ops), **rate-limited** (§3),
**resumable** (cursor records completed members; `--resume` skips them), **auditable**
(every response stored in `mp_raw_fetches` before parsing; every fact row points at it).

EC donations: the ingester searches the export for the MP's name with `et=rd`, keeps rows
whose `RegulatedDoneeType` is `MP - Member of Parliament`, and stores them by
`RegulatedEntityId`. It proposes a `mp_source_links` row when the EC entity name, with
honorifics and the trailing "MP" stripped, equals the member's display name with honorifics
stripped. That proposal is **not** public until a human confirms it (§6).

## 6. Matching and review

Some registers name people, not member IDs. Rules:

1. A link is proposed by a named deterministic rule (`rule:ec-exact-name-v1`) or, later, by
   an LLM (`llm:<model>`), with the evidence that justified it (normalised names compared,
   donee type, regulated entity id, for Companies House: date of birth month/year,
   correspondence address, nationality).
2. Confidence: `high` only for an exact normalised name match plus a corroborating
   register field (EC donee type = MP; CH date of birth matching the MP's public
   date of birth where one is published). Everything else is `medium` or `low`.
3. Only `status = 'confirmed'` links are used by the public views. Confirmation requires a
   named human reviewer (`npm run mp:ingest -- --confirm-link <id> --reviewer <name>`); the
   review is appended to `mp_source_link_reviews`.
4. A rejected link is kept (so it is not proposed again) and never used.

## 7. Stats

Code: `web/src/lib/mp-record/stats.ts`. Each stat has a stable `id`, a label, a methodology
footnote, a window, an "as of" date and a permalink:

`https://pooter.world/mp/{memberId}/stats/{statId}?asOf=YYYY-MM-DD`

The JSON is at `/api/mp/{memberId}/stats/{statId}?asOf=YYYY-MM-DD`. Computing it for an
`asOf` uses only versions with `retrieved_at` on or before the end of that day, so the
permalink is reproducible forever. The "as of" date shown is the last complete source
check at or before the requested date; if there is none the stat is "not yet available".

| id | what | source | window |
|---|---|---|---|
| `interests-value-12m` | sum of **stated GBP values** of register entries, grouped by top-level category, whose registration date falls in the 12 months to `asOf` | Register of Interests | 12 months |
| `interests-value-parliament` | same, since the start of the current Parliament (4 Jul 2024) | Register of Interests | Parliament |
| `interests-count` | number of current register entries by category | Register of Interests | as of |
| `donations-ec-12m` | sum of EC-registered donations to the MP as regulated donee, by accepted date | Electoral Commission | 12 months |
| `claims-by-status` | Claim Ledger claims attributed to the MP, by claim type and published verdict | Claim Ledger | all time |

Methodology rules that every footnote states:

- Sums use the register's stated value, in exact decimal arithmetic (pence), GBP only.
  Entries in another currency are counted and listed, not converted.
- Category 1.2 ("Ongoing paid employment") values are **per period** (e.g. monthly). They are
  excluded from sums and reported as a count of agreements; summing them would be wrong.
- Parent entries in category 1 carry no value; their child payments do. Nothing is counted
  twice.
- Register category 2 (donations to the MP) and Electoral Commission donations often
  describe the **same** donation. The two stats are never added together.
- The date basis is the register's *registration date* (Register of Interests) or *accepted
  date* (Electoral Commission), because those are always stated. It is printed with the stat.
- Entries with no stated value contribute nothing to a sum and are counted separately as
  "entries with no stated value".

### Citation format

```
pooter world MP Record, "<stat label>" for <MP name> (<memberId>): <value>, as of <date>.
Source: <register name>. <permalink>
```

e.g. `pooter world MP Record, "Registered earnings, gifts and visits, last 12 months" for
Sir James Cleverly (4366): £12,750.00, as of 28 October 2026. Source: Register of Members'
Financial Interests. https://pooter.world/mp/4366/stats/interests-value-12m?asOf=2026-10-28`

Generated by `citeStat()`; every stat on the page has a "Cite this" control.

## 8. Read API

CORS-open (`Access-Control-Allow-Origin: *`, `GET, OPTIONS`), JSON, rate-limited, cached
(`s-maxage=1800`). Documented in `docs/API_REFERENCE.md`.

- `GET /api/mp/{memberId}` — profile, periods, current interests, public donations,
  claims summary, stats, corrections, source checks, launch-gate status.
- `GET /api/mp/{memberId}/ties` — rows of the `mp_ties` view.
- `GET /api/mp/{memberId}/stats/{statId}?asOf=` — one stat with methodology and citation.
- `POST /api/mp/{memberId}/reply` — right of reply (rate-limited, not shown until answered).

## 9. Right of reply and corrections

- **Right of reply.** Every MP page links to `/mp/{memberId}/reply`. The MP or their office
  can attach a response to the record or to any entry. Replies are stored in `mp_replies`,
  are not shown until an operator verifies the sender's office (out of band) and answers,
  and are then shown in full beside the entry they refer to.
- **Corrections.** Any error on our side (parse bug, wrong link, wrong stat) is logged in
  `mp_corrections` with what was wrong, what changed, when and why, and displayed on the
  MP's page and at `/mp/corrections`. Because fact rows are immutable, a correction is a new
  version (or a rejected link), plus a log entry. Target: acknowledge within 2 working days,
  correct within 5.
- Register-side changes (an MP updates or rectifies an entry) are not corrections by us;
  they appear as new versions in the entry's history.

## 10. Update cadence

| source | cadence | why |
|---|---|---|
| Members API | daily | posts and party changes are rare but must be current |
| Register of Interests | daily | the register is updated continuously; published fortnightly-ish |
| Electoral Commission | weekly | the Commission publishes donee returns monthly/quarterly |
| Companies House | weekly (once built) | |
| APPGs | per register edition (~6-weekly) | |

## 11. Legal rules (UK)

- Defamation Act 2013: the record is built to rest on **truth** (s.2) and **publication on a
  matter of public interest** (s.4): verbatim register content, linked sources, no comment.
  Reports of the registers may also attract qualified privilege (Sch. 1 Defamation Act 1996,
  para 9/11 – fair and accurate copies/extracts of public registers) — **to be confirmed by
  the solicitor**.
- No inference of wrongdoing, no "conflict of interest" language, no juxtaposition of money
  with votes, no ranking of MPs by money received.
- UK GDPR: MPs' register entries are personal data published under a legal obligation;
  our lawful basis is legitimate interests / journalism (DPA 2018 Sch. 2 Part 5). Family
  members named in categories 9 and 10, and payers who are private individuals, are shown
  only as the register shows them; we do not enrich them.
- Licences: attribute the Open Parliament Licence and the Open Government Licence on every
  page and API response.

### Open questions for the solicitor

1. Does qualified privilege for fair and accurate reports of public registers cover our
   re-presentation (grouping, sums), or only verbatim extracts?
2. Are aggregate sums ("£X registered in 12 months") safe as stated, given the methodology
   footnotes, or must every sum sit next to its line items?
3. Tombstones: is "no longer in the register as of <date>" safe wording?
4. Companies House matches: what evidence threshold before showing a directorship?
5. Family members (categories 9, 10) and private-individual payers: show, redact or
   suppress?
6. Do we need a defined response window before publishing a new entry (we do not editorialise,
   so we propose no).
7. Immutability vs erasure: a court order or a valid UK GDPR erasure request would need a
   documented break-glass procedure (disable trigger, delete, re-enable, log). Confirm the
   procedure is acceptable.

## 12. Launch gate

- `MP_RECORD_LEGAL_SIGNOFF` unset → production 404s `/mp/*` and `/api/mp/*`, unless
  `MP_RECORD_PREVIEW=true` (set on dev/staging only). Staging is still a public URL, so
  preview also needs `MP_RECORD_PREVIEW_TOKEN` (at least 24 characters): open any `/mp`
  page once with `?preview=<token>` and the middleware sets an httpOnly `mp_preview` cookie
  for 30 days. Without the cookie, or with no token configured, staging 404s too. API
  responses are `private, no-store` until sign-off so no shared cache holds them. Pages show a banner: "Pre-launch: this
  record is pending legal review and is not published", and carry `robots: noindex`.
- `MP_RECORD_LEGAL_SIGNOFF` set → public; the footer shows "Legal review: <reference>".

## 13. Running the migration on dev

```
cd web
DATABASE_URL='<dev database url>' node scripts/migrate.js    # applies 014_mp_record.sql
DATABASE_URL='<dev database url>' npm run mp:ingest -- --members 5028,5122,4366
DATABASE_URL='<dev database url>' npm run mp:ingest -- --list-links --status proposed
# a named human checks each proposal's evidence, then:
DATABASE_URL='<dev database url>' npm run mp:ingest -- --confirm-link <id> --reviewer "<name>"
```

Set `MP_RECORD_PREVIEW=true` and a random `MP_RECORD_PREVIEW_TOKEN` (e.g.
`openssl rand -hex 24`) on the dev web service, then open
`https://dev.pooter.world/mp/4366?preview=<token>` once (dev runs with
`NODE_ENV=production`). Share the token only with reviewers. Migration 014 only creates new objects
(`pooter.mp_*` tables, views, one trigger function) and touches no existing table.
To log a correction until an operator UI exists, insert into `pooter.mp_corrections`
(append-only) with `corrected_by` set to a named person.

Never run against production until the launch gate is closed.
