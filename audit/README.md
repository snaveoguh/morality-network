# Daily edition fact audit (October 2026)

`editions/` holds every pooter.world daily edition still in the editorial
store: 72 of them, 11 Mar to 30 Oct 2026, exported read-only from
production on 30 Oct. Each file has the headline, daily title,
subheadline, body paragraphs and, for the 22 newest, `sourceRefs`: the
headlines (and sometimes summaries) the writer was given.

## Why

Editions were written by a model from bare headlines, under a prompt
that said "name the person, the town, the amount". It invented people,
quotes, statistics, dates and prices. Example: the 29 Oct edition (Afghan
opium) invented a farmer, a deputy minister, a dead teacher and his
sister, a 40% patrol cut, "$3bn" capex cuts (the source said Google and
Microsoft *put off raising* forecasts), an Anthropic 15%-of-profits
pledge, 4.1% eurozone inflation, five November dates, and crypto prices
from 2023. That edition has already been fixed by hand
(`2026-10-30_0x03359c13.json`, generatedAt reset by the edit); check it
but expect it to pass.

## What to do, per edition in your chunk file

1. List every checkable claim: names of people, quotes, numbers, prices,
   dates (past and future), places, causal claims ("X because Y").
2. Check each one:
   - against `sourceRefs` (headline and description) when present;
   - otherwise, and for anything sourceRefs do not cover, against the
     open web: find the original report from the stated outlet around
     the edition's date. Record the URL you used.
3. Classify each claim: `supported` (URL or sourceRef index), `wrong`
   (a source says otherwise), `unsupported` (nothing found: treat as
   invented).
4. If anything is `wrong` or `unsupported`, write a corrected edition:
   - Remove or correct those claims. Never replace them with other
     unchecked detail.
   - Keep everything that is supported. Attribute each story to its
     outlet ("Reuters reported").
   - Follow the house style in `web/src/lib/house-style.ts` and
     `docs/STYLE_GUIDE.md`: plain, literal, no metaphors, no tidy moral
     ending, no "amid", "underscores", "a stark reminder", etc.
   - A short, true edition is the goal. Several paragraphs may go.
   - Run the lint: `cd web && npx tsx -e` with `lintCopy(text, "body")`
     for each paragraph and `lintCopy(sub, "dek")` and
     `lintCopy(headline, "headline")`; no `error` severity issues.
   - If the headline itself is unsupported, propose a new one.

## Output

One file per edition in `results/`, same filename:

```json
{
  "hash": "0x…",
  "verdict": "clean" | "needs_edit",
  "claims": [
    { "text": "…", "status": "supported|wrong|unsupported", "evidence": "url or sourceRefs[n]", "note": "…" }
  ],
  "edits": {
    "headline": "… (only if changed)",
    "subheadline": "…",
    "editorialBody": ["…", "…"]
  }
}
```

Omit `edits` when the verdict is `clean`. Include all three edit fields
you change; `editorialBody` is the full replacement list.

Do not call any pooter.world API and do not change files outside
`audit/`. The edits are applied to production later from a machine
that holds the credentials, after review.

Commit your results on your own branch and open a PR into
`audit/editions` (not dev, not main).
