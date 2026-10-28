/**
 * House-style lint for AI-written copy — see docs/STYLE_GUIDE.md.
 *
 * Deterministic and free: regexes and phrase lists only, no LLM call. Run it
 * on generated headlines and standfirsts before they are published. An
 * `error` means the copy must not ship as written; a `warn` is logged for
 * the editor.
 *
 * The rules target the "AI tells" that made our front page read as machine
 * copy, e.g. the 2026-10-28 lead:
 *   "A Spanish train wreck leaves a mother's lullaby on the tracks while
 *    world leaders duel over votes and knives."
 * which trips leaves…while, length, duel and the trailing full stop.
 *
 * HOUSE_STYLE_PROMPT is the same rule set written for a model. It is
 * appended to writer prompts so the model is told the rules the lint checks.
 */

export type CopyKind = "headline" | "dek" | "body" | "ledger";
export type StyleSeverity = "error" | "warn";

export interface StyleIssue {
  rule: string;
  severity: StyleSeverity;
  match: string;
  message: string;
}

interface PhraseRule {
  rule: string;
  pattern: RegExp;
  message: string;
  /** Severity per kind; kinds not listed are not checked. */
  severity: Partial<Record<CopyKind, StyleSeverity>>;
}

const ALL_ERROR = { headline: "error", dek: "error", body: "warn", ledger: "error" } as const;
const SHORT_ERROR = { headline: "error", dek: "error", body: "warn", ledger: "error" } as const;
const SHORT_WARN = { headline: "warn", dek: "warn", body: "warn", ledger: "error" } as const;
const LEDGER_ONLY = { ledger: "error", headline: "warn", dek: "warn" } as const;

const PHRASE_RULES: PhraseRule[] = [
  // ── Stock AI phrasing ──────────────────────────────────────────────
  {
    rule: "cliche",
    pattern:
      /\b(a stark reminder|a (?:sobering|grim|chilling|timely) reminder|serves as a reminder|in a world where|tapestry|delv(?:e|es|ing)|testament to|double-edged sword|perfect storm|sends? shock-?waves|shock-?waves|only time will tell|it remains to be seen|at the end of the day|make no mistake|let that sink in|here's the thing|the stakes (?:have never been|could not be|couldn't be) higher|game[- ]?changer|wake-?up call|lays? bare|pulls? the rug|writ large|a cautionary tale|litmus test|in the shadows of|ripple effects?|the real story|uncharted (?:waters|territory)|brave new world|seismic shift|watershed moment|paradigm shift)\b/i,
    message: "Stock phrase. Say what happened instead.",
    severity: ALL_ERROR,
  },
  {
    rule: "amid",
    pattern: /\bamid(?:st)?\b/i,
    message: "'amid' joins two facts without saying how they connect. Pick one, or state the link.",
    severity: { headline: "error", dek: "error", body: "warn", ledger: "error" },
  },
  {
    rule: "not-just-but",
    pattern: /\b(?:not (?:just|only|merely|simply)|(?:is|was|are|were)n['’]t (?:just|only|merely|about))\b[^.;:!?]{1,80}?\b(?:but|it['’]s|it is|they['’]re)\b/i,
    message: "'not just X but Y' framing. State Y.",
    severity: SHORT_ERROR,
  },
  {
    rule: "becomes-symbol",
    pattern:
      /\b(?:becomes?|became|(?:turn|transform)(?:s|ed|ing)?\b[^.;:]{0,60}?\binto)\s+(?:a |an |the )?(?:\w+\s+){0,3}?(?:meme|headline|symbol|metaphor|flashpoint|lightning rod|battleground|battlefield|cautionary tale|test|referendum|proof|ledger|reckoning|wake-up call)s?\b/i,
    message: "'X becomes a symbol/meme/headline/test' is a metaphor, not news. Report the event.",
    severity: SHORT_ERROR,
  },
  {
    rule: "leaves-while",
    pattern: /\bleaves?\b[^.;:]{3,120}\bwhile\b/i,
    message: "'X leaves Y while Z' stitches unrelated stories into one sentence. One story per headline.",
    severity: { headline: "error", dek: "error", body: "warn" },
  },
  {
    rule: "while-contrast",
    pattern: /,\s*while\b|\swhile\s+(?:the |world |politicians |leaders |ceos |traders |the rich |tech |markets )/i,
    message: "Contrast clause ('while leaders squabble…') is editorialising. Cut it or make it its own story.",
    severity: { headline: "error", dek: "warn" },
  },
  {
    rule: "same-day-juxtaposition",
    pattern: /\b(?:the same (?:day|night|week|morning)|on the same (?:day|night)|meanwhile)\b/i,
    message: "Juxtaposing unrelated events implies a link that isn't shown.",
    severity: { headline: "error", dek: "error", body: "warn" },
  },
  {
    rule: "scene-setting-when",
    pattern: /^\s*(?:when|as(?! (?:many|much|few|little|of|well)\b)|behind(?! the scenes)|beneath|in the (?:wake|shadow) of)\b/i,
    message: "Scene-setting opener. Lead with the subject and the verb.",
    severity: { headline: "error", dek: "error" },
  },
  {
    rule: "all-whisper",
    pattern: /\b(?:all|both) (?:whisper|tell|point to|share) the same\b/i,
    message: "False-unity line. Unrelated things do not share a lesson.",
    severity: SHORT_ERROR,
  },
  {
    rule: "reshape-narrative",
    pattern: /\b(?:reshap\w*|narratives?)\b/i,
    message: "'reshapes the narrative' says nothing checkable. What changed, by how much?",
    severity: { headline: "error", dek: "error", body: "warn" },
  },
  {
    rule: "crypto-shoehorn",
    pattern: /\b(?:safe[- ]haven|digital gold|risk[- ]off|risk[- ]on|crypto(?:currency)?|bitcoin|btc)\b/i,
    message: "Market/crypto angle in a non-market headline or dek. Keep it in the market section unless the story is about markets.",
    // Only meaningful when the copy isn't about markets; callers pass
    // { marketStory: true } to skip.
    severity: { headline: "warn", dek: "warn" },
  },

  // ── Purple / loaded vocabulary ─────────────────────────────────────
  {
    rule: "purple",
    pattern:
      /\b(?:lullaby|funeral pyre|bodies cool|bleed(?:s|ing)? (?:people|out)|run red|screams?|echo(?:es)? of|whispers?|haunt\w*|grapples?|grappling|reckoning|duel(?:s|ling)?|squabbl\w*|gambit|gamble[sd]?|teeter\w*|ignit\w*|fuels|fuelled|fueling|fuelling|sparks|sparked|carnage|shreds?|erases?|cages?|sleek|fragile modernity|indifferent calculus|bruised democracy)\b/i,
    message: "Figurative or emotive word. Use the plain literal verb or noun.",
    severity: { headline: "error", dek: "error", body: "warn" },
  },
  {
    rule: "intensifier",
    pattern:
      /\b(?:stark|stunning|shocking|chilling|harrowing|heartbreaking|devastating|dramatic(?:ally)?|explosive|bombshell|unprecedented|staggering|alarming|pivotal|bold|brazen|incredibly|truly|obviously)\b/i,
    message: "Intensifier or value adjective. Let the fact carry the weight.",
    severity: { headline: "error", dek: "warn", body: "warn", ledger: "error" },
  },
  {
    rule: "soft-intensifier",
    pattern: /\b(?:historic|massive|huge|crucial|vital|key|deeply|clearly|very)\b/i,
    message: "Weak intensifier. Usually cuttable.",
    severity: { headline: "warn", dek: "warn", ledger: "error" },
  },
  {
    rule: "loaded-verb",
    pattern: /\b(?:slam(?:s|med)?|blasted|rips into|ripped|hits? out|lash(?:es|ed)? out|savag\w*|destroy(?:s|ed)? |eviscerat\w*|insists?|insisted|boasts?|boasted)\b/i,
    message: "Loaded attribution verb. Use 'said', 'told', 'wrote' or 'voted'.",
    severity: { headline: "error", dek: "error", body: "warn", ledger: "error" },
  },
  {
    rule: "claimed",
    pattern: /\bclaim(?:s|ed)\b/i,
    message: "'claimed' signals doubt. Use 'said' unless the record shows otherwise, then say what the record shows.",
    severity: { headline: "warn", dek: "warn", body: "warn", ledger: "error" },
  },
  {
    rule: "ledger-adjective",
    pattern: /\b(?:misleading|false(?:ly)?|wrong(?:ly)?|dubious|bogus|spurious|controversial|so-called|embattled|beleaguered|disgraced|under-fire|hapless)\b/i,
    message: "Characterising adjective. Ledger copy states what the record shows, nothing more.",
    severity: LEDGER_ONLY,
  },
  {
    rule: "underscore",
    pattern: /\b(?:underscor\w*|highlight(?:s|ed|ing)? the|signal(?:s|led|ing)? a|exposes? (?:how|the|a)|reveals? how|shows? how)\b/i,
    message: "'underscores/signals/exposes how' is analysis posing as news. State the fact.",
    severity: SHORT_WARN,
  },
];

/** Plain list for prompts and the style guide. Keep in sync with PHRASE_RULES. */
export const BANNED_PHRASES: readonly string[] = [
  "a stark reminder", "serves as a reminder", "in a world where", "amid", "tapestry",
  "delve", "testament to", "lays bare", "pulls the rug", "litmus test", "cautionary tale",
  "ripple effects", "shockwaves", "perfect storm", "double-edged sword", "only time will tell",
  "it remains to be seen", "make no mistake", "the stakes have never been higher",
  "not just X but Y", "X isn't just Y, it's Z", "X becomes a meme / symbol / headline / test",
  "X leaves Y while Z", "while world leaders…", "the same day / the same night / meanwhile",
  "When… (as an opener)", "reshapes the narrative", "narrative", "underscores", "signals a",
  "exposes how", "safe-haven / digital gold (outside market copy)",
  "slams", "blasts", "admits", "insists", "boasts", "claimed (in ledger copy)",
  "stark", "stunning", "shocking", "chilling", "harrowing", "unprecedented", "historic",
  "pivotal", "crucial", "bold", "gamble", "gambit", "duel", "squabble", "fuels", "sparks",
  "ignites", "whispers", "echoes of", "haunting", "grapples", "reckoning",
];

const WORD_LIMITS: Record<CopyKind, { warn: number; error: number } | null> = {
  headline: { warn: 12, error: 15 },
  dek: { warn: 28, error: 35 },
  body: null,
  ledger: { warn: 35, error: 50 },
};
const HEADLINE_CHAR_WARN = 75;
const DEK_CHAR_WARN = 160;
/** "…in the U.S." — a trailing abbreviation, not a full stop. */
const ABBREV_END = /\b[A-Z]\.\s*$/;

function wordCount(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export interface LintOptions {
  /** The story is about markets — allows crypto/market vocabulary. */
  marketStory?: boolean;
}

export function lintCopy(text: string, kind: CopyKind, opts: LintOptions = {}): StyleIssue[] {
  const issues: StyleIssue[] = [];
  const t = (text ?? "").trim();
  if (!t) return [{ rule: "empty", severity: "error", match: "", message: "Empty copy." }];

  for (const r of PHRASE_RULES) {
    const severity = r.severity[kind];
    if (!severity) continue;
    if (r.rule === "crypto-shoehorn" && opts.marketStory) continue;
    const m = r.pattern.exec(t);
    if (m) issues.push({ rule: r.rule, severity, match: m[0].trim(), message: r.message });
  }

  const limits = WORD_LIMITS[kind];
  if (limits) {
    const n = wordCount(t);
    if (n > limits.error) {
      issues.push({ rule: "length", severity: "error", match: `${n} words`, message: `Too long (max ${limits.error} words, aim for ${limits.warn}).` });
    } else if (n > limits.warn) {
      issues.push({ rule: "length", severity: "warn", match: `${n} words`, message: `Long (aim for ${limits.warn} words or fewer).` });
    }
  }

  const dashes = (t.match(/[—–]|\s-\s/g) ?? []).length;
  if (kind === "headline" || kind === "ledger") {
    if (dashes > 0) issues.push({ rule: "em-dash", severity: kind === "ledger" ? "error" : "warn", match: "—", message: "No dashes in headlines or ledger copy. Use a colon or two sentences." });
  } else if (kind === "dek") {
    if (dashes > 1) issues.push({ rule: "em-dash", severity: "error", match: "—", message: "At most one dash in a standfirst." });
  } else if (kind === "body") {
    const per100 = (dashes / Math.max(1, wordCount(t))) * 100;
    if (per100 > 1) issues.push({ rule: "em-dash", severity: "warn", match: `${dashes} dashes`, message: "More than one dash per 100 words. Use full stops." });
  }

  if (kind === "headline") {
    if (/!/.test(t)) issues.push({ rule: "exclamation", severity: "error", match: "!", message: "No exclamation marks." });
    if (/\?\s*$/.test(t)) issues.push({ rule: "question", severity: "warn", match: "?", message: "Question headlines are usually answered 'no'. State what is known." });
    if (/\.\s*$/.test(t) && !ABBREV_END.test(t)) {
      issues.push({ rule: "full-stop", severity: "warn", match: ".", message: "No full stop at the end of a headline." });
    }
    if (t.length > HEADLINE_CHAR_WARN) {
      issues.push({ rule: "chars", severity: "warn", match: `${t.length} chars`, message: `Over ${HEADLINE_CHAR_WARN} characters; it will truncate in search results and push alerts.` });
    }
    // Headline lists: "Kenya frees Ebola contacts, oil wavers, and AI's conscience stalls"
    if ((t.match(/,/g) ?? []).length >= 2 || /,\s*and\b/.test(t)) {
      issues.push({ rule: "list-headline", severity: "error", match: ",", message: "Comma list of stories. One story per headline." });
    }
  }

  if (kind === "dek" && t.length > DEK_CHAR_WARN) {
    issues.push({ rule: "chars", severity: "warn", match: `${t.length} chars`, message: `Over ${DEK_CHAR_WARN} characters; search snippets and cards cut it off.` });
  }
  if (kind === "dek" && (t.match(/,/g) ?? []).length >= 3) {
    issues.push({ rule: "stacked-clauses", severity: "warn", match: ",", message: "Three or more clauses. Split or cut." });
  }

  return issues;
}

export function hasStyleErrors(issues: StyleIssue[]): boolean {
  return issues.some((i) => i.severity === "error");
}

/** Mechanical, meaning-preserving fixes only: trailing full stop, wrapping quotes. */
export function tidyHeadline(text: string): string {
  const t = text.trim().replace(/^["'“‘]+|["'”’]+$/g, "").trim();
  return ABBREV_END.test(t) ? t : t.replace(/\.\s*$/, "").trim();
}

export interface PickResult {
  text: string;
  issues: StyleIssue[];
  /** True when every candidate had errors and the least-bad one was kept. */
  rejected: boolean;
}

/**
 * Choose the first candidate with no style errors. If none pass, return the
 * candidate with the fewest errors and `rejected: true` so the caller can
 * flag it. Candidates come from output we already have (writer section,
 * extractor field, a second option in the same response) — never a new call.
 */
export function pickCleanCopy(candidates: Array<string | null | undefined>, kind: CopyKind, opts: LintOptions = {}): PickResult | null {
  const scored = candidates
    .map((c) => (c ?? "").trim())
    .filter(Boolean)
    .map((c) => (kind === "headline" ? tidyHeadline(c) : c))
    .filter((c, i, arr) => arr.indexOf(c) === i)
    .map((text) => ({ text, issues: lintCopy(text, kind, opts) }));
  if (scored.length === 0) return null;

  const clean = scored.find((s) => !hasStyleErrors(s.issues));
  if (clean) return { ...clean, rejected: false };

  const errors = (s: { issues: StyleIssue[] }) => s.issues.filter((i) => i.severity === "error").length;
  const best = scored.reduce((a, b) => (errors(b) < errors(a) ? b : a));
  return { ...best, rejected: true };
}

export function formatIssues(issues: StyleIssue[]): string {
  return issues.map((i) => `${i.severity}:${i.rule}(${i.match})`).join(", ");
}

/**
 * Compact rule block for writer prompts. Kept short on purpose: it rides on
 * every editorial call, so every line costs input tokens.
 */
export const HOUSE_STYLE_PROMPT = `HOUSE STYLE (pooter world — read like Reuters or the Commons Library, not like a novelist):
- Headline: one story, one sentence, subject + active present-tense verb + the fact. 6-12 words, max 75 characters. No full stop, no exclamation mark, no dash, no comma lists. Include the number or the place if there is one.
- Standfirst (subheadline): one sentence, max 28 words, adds the next most important fact (who said it, when, the figure, what happens next). No metaphor. No second unrelated story.
- First paragraph: who, what, where, when, in under 35 words. Then the evidence. Then the context.
- Attribute with "said". Never "slammed", "blasted", "admitted", "insisted", "claimed".
- Numbers: give the figure, the unit, the period and the source ("£2.1bn in 2025-26, ONS"). Round sensibly. Percentages vs percentage points: be exact.
- Plain words. If a sentence would still be true of a different story, cut it.
- Never write: ${BANNED_PHRASES.slice(0, 40).join("; ")}.
- No "X leaves Y while Z", no "the same night…", no "When X, Y" openers, no "not just X but Y", no tidy one-line moral at the end.
- One idea per sentence. Most sentences under 25 words. Paragraphs of one to three sentences.`;
