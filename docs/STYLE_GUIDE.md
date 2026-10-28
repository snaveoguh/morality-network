# pooter house style

How pooter writes. This covers people and the AI writers alike. Visual design
lives in [`DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md). Research and sources are in
[`writing-research.md`](writing-research.md).

**The test:** could an MP read this sentence aloud in the Commons, credit
pooter.world, and not be embarrassed? If not, rewrite it.

There are two registers:

- **Record**: Claim Ledger, MP pages and anything with a verdict. Written
  like a House of Commons Library briefing: dry, exact, citable, with no
  adjectives.
- **News**: the feed, the daily edition and originals. Written like a
  Reuters or BBC News story: plain, quick and still factual.

The rules in §1 apply to both.

---

## 1. Rules for everything

1. **Say what happened.** Use a subject, an active verb and the fact: "Barclays
   to cut 5,000 jobs", not "Barclays' AI-driven cull signals a turning point".
2. **One idea per sentence. One story per headline.** Never join unrelated
   events with "while", "as", "amid" or "the same night".
3. **Be literal.** Use no metaphors in headlines, standfirsts or ledger copy.
   If a phrase would need explaining to a non-native speaker, cut it.
4. **Attribute with "said".** "Told", "wrote", "voted" and "asked" are fine. Do
   not use "claimed", "admitted", "insisted", "slammed", "blasted" or
   "boasted". Each one is a verdict hidden inside a verb.
5. **Every number has a unit, a period and a source.** Write "£2.1bn in
   2025-26 (ONS)", not "billions". Say whether a rise is in percent or
   percentage points. Say whether money is real or cash terms and give the base
   year.
6. **Use names and specifics.** Name the person, the place, the date and the
   amount. If a sentence would still be true of a different story, delete it.
7. **Keep it short.** Aim for 15–20 words per sentence and keep almost all of
   them under 25. Paragraphs are one to three sentences, because readers are on
   phones.
8. **Don't end on a moral.** The last line is a fact, a date or what happens
   next. It is never an aphorism.
9. **Don't overuse dashes.** None in headlines or ledger copy, at most one in a
   standfirst, and about one per 100 words in body text. Use a full stop.
10. **Correct in the open.** Every correction says what was wrong, what is
    right and when it changed. It goes on the
    [corrections register](https://pooter.world/ledger/corrections), never in a
    silent edit.

### Banned words and phrases

These are the AI tells. The canonical list is in
[`web/src/lib/house-style.ts`](../web/src/lib/house-style.ts), which the lint
uses. It has tests in
[`house-style.test.ts`](../web/src/lib/__tests__/house-style.test.ts).

| Don't write | Why | Write instead |
|---|---|---|
| a stark reminder, serves as a reminder, a cautionary tale | It tells the reader what to feel | Give the fact that reminds them |
| amid | It hides how two facts relate | Use "after", "because" or "during", or two sentences |
| in a world where, in today's world | Throat-clearing | Start with the news |
| X leaves Y while Z | It stitches two stories together | Two headlines |
| the same day / the same night / meanwhile | It implies a link the sources don't show | "Elsewhere," or a separate item |
| When X, Y (as an opener) | Scene-setting delays the news | Subject + verb first |
| not just X but Y / X isn't just Y, it's Z | A false contrast | State Y |
| X becomes a meme / symbol / headline / test / flashpoint | A metaphor posing as news | What happened |
| lays bare, pulls the rug, litmus test, ripple effects, shockwaves, perfect storm | Stock metaphors | The literal consequence, with a number |
| narrative, reshapes, underscores, signals, exposes how, reveals how | Analysis posing as fact | What changed, by how much, according to whom |
| gamble, gambit, duel, squabble, fuels, sparks, ignites, cull, whispers, echoes, haunting | Purple verbs | bet / decision, plan, contest, argue, causes, leads to, job cuts |
| stark, stunning, shocking, chilling, harrowing, unprecedented, pivotal, bold | Intensifiers | Delete the word, and add the number if the claim needs one |
| slams, blasts, admits, insists, boasts, claims | Loaded attribution | said |
| safe-haven, digital gold, risk-off (outside market copy) | A crypto angle forced onto non-market news | Keep it in the market section |

---

## 2. The Record register (Claim Ledger, MP pages, verdicts)

The model is the House of Commons Library briefing and the Full Fact check.
Write so that a journalist or an MP can lift one sentence and use it without
having to rewrite it.

### The citable sentence

Every finding should have one sentence in this form:

> **[Who] said [what] in [forum] on [date]. [Record] shows [figure, unit,
> period]. ([Source], [permalink])**

For example (this is the structure only, from
[`LEDGER_VERDICT_TEMPLATE.md`](LEDGER_VERDICT_TEMPLATE.md)):

> The Deputy Prime Minister said "We have invested £700 million in probation"
> at Prime Minister's Questions on 8 July 2026. [Record] shows [figure] for
> [period]. (Hansard; [source record])

Rules:

- **Quote Hansard verbatim and in full.** The quote must be an exact
  substring, and it must be the whole sentence, never a spliced fragment. If
  the context changes the meaning, include the context. Link to the
  contribution on hansard.parliament.uk.
- **Give the forum and date as Hansard prints them**: "at Prime Minister's
  Questions, 8 July 2026" or "in a Westminster Hall debate, 3 June 2026". On
  first mention give the member's name, party and constituency or title. After
  that use the surname only.
- **Use the four verdicts and nothing else**: `Resolved true`,
  `Resolved false`, `Partially true`, `Unresolved`. Never write "lie",
  "misleading", "false claim", "dubious", "so-called" or "embattled". The
  lint's `ledger` mode rejects these. Records can't show motive, so we never
  describe it.
- **Write "said", not "claimed".** The page heading on the homepage currently
  reads "what they claimed vs what the records show". It should read **"What
  MPs said, and what the records show"**.
- **State what the record shows, in the record's terms.** Write "ONS series
  X shows 1.2 million in Q2 2026", not "the figure is far lower than
  claimed".
- **Absence is not falsity.** Write "We found no record of…" and name where
  we looked. Never write "There is no evidence".
- **Numbers.** Give the base year for real-terms money ("2025-26 prices"). Give
  per-head figures when comparing areas of different size. Round in the text
  (£1.2bn), with the exact figure in the evidence chain. Write "rose 2
  percentage points, from 4% to 6%", not "rose 2%". Name the average (median
  or mean).
- **No adjectives on the finding.** A verdict sentence has nouns, numbers,
  dates and the verb "shows". "Significant", "sharp" and "only" are judgements.
  If the size matters, give the comparison: "the highest since 2011 (ONS)".
- **Corrections** go on the corrections register in this format: date, what we
  said, what is correct, the source, and when the page changed.

### Before / after (Record)

| Before | After |
|---|---|
| what they claimed vs what the records show | What MPs said, and what the records show |
| Everyone claims the moral high ground. We check the record. | Statements from Parliament, checked against the public record. |
| The minister's boast about probation funding doesn't stand up. | The minister said £700m had been invested in probation. [Record] shows [figure] for [period]. Verdict: Partially true. |
| A misleading claim about NHS waiting lists | Statement on NHS waiting lists, 8 July 2026: Unresolved |

---

## 3. The News register (feed, daily edition, originals)

The model is the Reuters or BBC News story, read on a phone. Get the news in
first, then the evidence, then the context: an inverted pyramid. Opinion
pieces may argue, but the argument is carried by facts, not adjectives.

### Headlines

- **6–12 words, at most 75 characters.** Longer headlines truncate in search
  results, push alerts and social cards.
- **Subject + active verb + fact, in the present tense**: "Two high-speed
  trains collide in Spain, killing at least 30".
- **One story.** No comma lists ("Kenya frees Ebola contacts, oil wavers, and
  AI's conscience stalls").
- **Literal.** No puns, no metaphors, no questions. A question headline is
  usually answered "no".
- No full stop, no exclamation mark, no dash. Use a colon for a label:
  "Spain train collision: at least 30 dead".
- Put the most specific noun in the first 40 characters, because that is what
  survives truncation on cards and lock screens.
- Give numbers as figures (5,000, not five thousand). For a death toll still
  being counted, use "at least" and the latest figure from a named source, and
  update the figure as it changes.

### Standfirst (subheadline / dek)

- **One sentence of up to 28 words, about the same story.** It adds the next
  most important fact: who said what, the figure, what happens next.
- It never adds a second story, and it never "reframes". No "When X, Y", no
  "turns X into Y".

### First paragraph

- **Who, what, where and when, in under 35 words.** The reader should be able
  to stop there and know the story.
- Attribute in the first or second paragraph. Link the primary source.

### Daily edition title (the kicker)

- **2–5 words, in capitals.** Wit is allowed, but it must point at the lead
  story's facts, not at a mood. "THE SCARS OF SUNDOWN" is a mood. "SPAIN RAIL
  CRASH" or "TWO TRAINS, ONE TRACK" is a story.

### Market copy

- **Crypto and market transmission stays in the market section.** Ten
  standfirsts in one day's feed ended with "revive Bitcoin's safe-haven
  narrative". That tells the reader the copy was written by a template.

### Mobile, cards and push

- **Card:** headline plus the first clause of the standfirst. It must make
  sense with nothing else around it.
- **Push alert:** one sentence of 100 characters or fewer, with the fact
  first. "At least 30 killed as two high-speed trains collide in Spain". Don't
  write "BREAKING", and never use a teaser ("You won't believe…").
- Avoid paragraphs of more than three sentences. One-sentence paragraphs are
  fine.

### Before / after (News)

The before column is real pooter copy from 27–28 October 2026.

| Before | After |
|---|---|
| A Spanish train wreck leaves a mother's lullaby on the tracks while world leaders duel over votes and knives. | Two high-speed trains collide in Spain, killing at least 30 |
| When a commuter's last goodbye becomes a meme, the same night in Belgrade a policeman's badge turns into a headline, and a billionaire's tweet reshapes a midterm narrative. | Prime Minister Pedro Sánchez spoke about the collision as the reported death toll rose during the day. |
| Kenya frees Ebola contacts, oil wavers, and AI's conscience stalls. | Kenya releases Ebola contacts from quarantine (one story; the others get their own items) |
| Four Canadian soldiers die in a prairie fire while politicians squabble over fuel subsidies. | Four Canadian soldiers die in prairie fire during training |
| Paris protester's broken knee becomes the most vivid proof of Europe's bruised democracy. | Paris protester suffers broken knee at [event], [source] says |
| Spain's rail tragedy pulls the rug from Europe's high-speed dream and forces investors into safe-haven havens the world already fears. | [Named official] said [what is known about the cause]; [what happens next, with a date]. (Report only what the sources say.) |
| Barclays' AI-driven cull signals a turning point where big-bank cost cuts become a catalyst for broader tech-inflated risk-off cycles. | Barclays said it would cut 5,000 jobs this year, about X% of its workforce. |
| Israel's record-turnout vote turns a domestic power struggle into a global litmus test for democratic resilience, with ripple effects that could … revive Bitcoin's safe-haven narrative. | Turnout was X%, the highest since Y, the election committee said. Results are expected on [date]. |
| Feed overrepresents left-leaning sources (28 outlets) while underrepresenting right-wing perspectives (17 outlets), creating blind spots … masking the imbalance. | Today's feed: 28 left-leaning outlets, 17 right-leaning. Most are rated high for factuality. |

(X and Y mark facts the writer must take from the source. Never fill them in
by guessing.)

---

## 4. How this is enforced

- **Prompts.** `HOUSE_STYLE_PROMPT` in `web/src/lib/house-style.ts` is added
  to the daily-edition writer (`web/src/lib/daily-edition.ts`) and the
  per-story editorial writer (`web/src/lib/claude-editorial.ts`). pooter1
  (`agents/pooter1/src/tasks/write-editorial.ts`) carries a short copy of the
  rules that overrides its evolving voice profile.
- **Lint.** `lintCopy(text, "headline" | "dek" | "body" | "ledger")` uses only
  regexes and costs nothing to run. An `error` blocks the copy and a `warn` is
  logged.
  - Daily edition: picks between the extractor's headline and the writer's own
    section, whichever passes. If neither passes it logs `[house-style]` and
    keeps the version with fewer errors.
  - Per-story editorials: if the standfirst fails, it falls back to the first
    sentence of the writer's wire summary.
  - pooter1: asks for three headline candidates in one call.
    `/api/articles/publish` with `styleLint: "enforce"` returns a 422 for a
    failing title, and the agent tries the next candidate. Posts by people are
    never linted.
- **No new LLM calls.** Every fallback uses text we already generated.
- **Adding a rule.** Add it to `PHRASE_RULES` and `BANNED_PHRASES`, add a
  failing example from real copy to the tests, then run
  `npx vitest run src/lib/__tests__/house-style.test.ts` in `web/`.
