/**
 * House-style check for pooter1's on-chain comments — a cut-down copy of
 * web/src/lib/house-style.ts (this agent deploys on its own and cannot
 * import from web/). Keep the phrase list in step with that file.
 *
 * Comments are opinion, so the bar is not "neutral": it is "plain". The
 * rules target what the 2026-10-28 front page showed, e.g.
 *   "A mother in Detroit watches her grocery bill climb while the Fed
 *    promises 'price stability'—as if a spreadsheet can stop a kid's
 *    stomach growling."
 * an invented vignette, "X while Y", a dash and a metaphor in one line.
 *
 * Deterministic: regexes only, no LLM call.
 */

export interface CommentIssue {
  rule: string;
  match: string;
}

const RULES: Array<{ rule: string; pattern: RegExp }> = [
  // Invented people: "A mother in Detroit…", "An ex-Google analyst in Austin…"
  { rule: "vignette", pattern: /^An?\s+(?:[\w'’-]+\s+){1,4}(?:in|from|at|outside)\s+[A-Z]/ },
  { rule: "vignette", pattern: /\b(?:somewhere|picture|imagine)\b[^.]{0,40}\b(?:a|an)\s+\w+/i },
  {
    rule: "cliche",
    pattern:
      /\b(a stark reminder|a (?:sobering|grim|chilling|timely) reminder|serves as a reminder|in a world where|tapestry|delv(?:e|es|ing)|testament to|double-edged sword|perfect storm|shock-?waves|only time will tell|it remains to be seen|at the end of the day|make no mistake|let that sink in|here's the thing|game[- ]?changer|wake-?up call|lays? bare|pulls? the rug|writ large|cautionary tale|litmus test|ripple effects?|the real story|uncharted (?:waters|territory)|seismic shift|watershed moment|paradigm shift|as if)\b/i,
  },
  { rule: "amid", pattern: /\bamid(?:st)?\b/i },
  { rule: "not-just-but", pattern: /\b(?:not (?:just|only|merely|simply)|(?:is|was|are|were)n['’]t (?:just|only|merely|about))\b[^.;:!?]{1,80}?\b(?:but|it['’]s|it is|they['’]re)\b/i },
  { rule: "while", pattern: /\b(?:watch(?:es|ed)?|leaves?|left)\b[^.]{1,60}\bwhile\b/i },
  { rule: "narrative", pattern: /\b(?:narrative|reckoning|underscor\w*|unprecedented|stunning|shocking|chilling|harrowing|haunting|pivotal|gambit|duel|squabble|whispers|echoes of|grapples?|cameo|courtroom drama)\b/i },
  { rule: "attribution", pattern: /\b(?:slam(?:s|med)|blast(?:s|ed)|boasts?|insist(?:s|ed))\b/i },
  { rule: "exclamation", pattern: /!/ },
];

const MAX_WORDS = 60;

export function lintComment(text: string): CommentIssue[] {
  const t = (text ?? "").trim();
  if (!t) return [{ rule: "empty", match: "" }];
  const issues: CommentIssue[] = [];
  for (const r of RULES) {
    const m = r.pattern.exec(t);
    if (m) issues.push({ rule: r.rule, match: m[0].trim() });
  }
  const words = t.split(/\s+/).length;
  if (words > MAX_WORDS) issues.push({ rule: "length", match: `${words} words` });
  const dashes = (t.match(/[—–]|\s-\s/g) ?? []).length;
  if (dashes > 1) issues.push({ rule: "dashes", match: `${dashes} dashes` });
  return issues;
}

export function formatCommentIssues(issues: CommentIssue[]): string {
  return issues.map((i) => `${i.rule}(${i.match})`).join(", ");
}

/** Prompt block: the same rules, told to the model. */
export const COMMENT_STYLE_PROMPT = [
  `HOUSE STYLE (overrides the voice above):`,
  `- Plain, literal English, like a sharp letter to the FT. The opinion is in the argument, not in adjectives or metaphors.`,
  `- Never invent people or scenes ("A mother in Detroit…", "Picture a…"). Talk about the story itself.`,
  `- Make one point: a fact the coverage leaves out, a number that changes the picture, or a link to another event. Name it.`,
  `- 1-2 sentences, under 50 words. At most one dash. No exclamation marks.`,
  `- Never write: a stark reminder, as if, in a world where, amid, here's the thing, lays bare, narrative, underscores, not just X but Y, X watches Y while Z, cameo, drama, reckoning, unprecedented, stunning, chilling.`,
].join("\n");
