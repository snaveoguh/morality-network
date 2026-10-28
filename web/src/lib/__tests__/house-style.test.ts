import { describe, expect, it } from "vitest";
import { hasStyleErrors, lintCopy, pickCleanCopy, tidyHeadline } from "../house-style";

const rules = (text: string, kind: Parameters<typeof lintCopy>[1]) =>
  lintCopy(text, kind).filter((i) => i.severity === "error").map((i) => i.rule);

describe("lintCopy — real pooter copy that must not ship", () => {
  it("rejects the 2026-10-28 front-page lead", () => {
    const headline =
      "A Spanish train wreck leaves a mother's lullaby on the tracks while world leaders duel over votes and knives.";
    const r = rules(headline, "headline");
    expect(r).toEqual(expect.arrayContaining(["leaves-while", "while-contrast", "purple", "length"]));
  });

  it("rejects the 2026-10-28 front-page dek", () => {
    const dek =
      "When a commuter's last goodbye becomes a meme, the same night in Belgrade a policeman's badge turns into a headline, and a billionaire's tweet reshapes a midterm narrative.";
    expect(rules(dek, "dek")).toEqual(
      expect.arrayContaining(["scene-setting-when", "becomes-symbol", "same-day-juxtaposition", "reshape-narrative"]),
    );
  });

  it.each([
    ["Kenya frees Ebola contacts, oil wavers, and AI's conscience stalls.", "list-headline"],
    ["Four Canadian soldiers die in a prairie fire while politicians squabble over fuel subsidies.", "while-contrast"],
    ["Paris protester's broken knee becomes the most vivid proof of Europe's bruised democracy.", "becomes-symbol"],
    ["Ohio hazmat blast kills firefighter, while Sudan market massacre shreds hope for peace", "while-contrast"],
  ])("rejects headline %s", (headline, rule) => {
    expect(rules(headline, "headline")).toContain(rule);
  });

  it.each([
    ["Spain's rail tragedy pulls the rug from Europe's high-speed dream.", "cliche"],
    ["The shelter crisis lays bare a governance gap that threatens civilian morale.", "cliche"],
    ["A Nepalese boulder, a Vatican bedside, and a crypto whale all whisper the same warning.", "all-whisper"],
    ["The Houthis' new missile campaign turns Saudi Arabia's energy hub into a flashpoint.", "becomes-symbol"],
    ["The vote is not just a referendum on Netanyahu but a test for the region.", "not-just-but"],
    ["Ministers met amid growing pressure over the budget.", "amid"],
  ])("rejects dek %s", (dek, rule) => {
    expect(rules(dek, "dek")).toContain(rule);
  });

  it("flags crypto angles in non-market copy, but not in market stories", () => {
    const dek = "The strike could tighten oil markets and revive the digital gold trade.";
    expect(lintCopy(dek, "dek").map((i) => i.rule)).toContain("crypto-shoehorn");
    expect(lintCopy(dek, "dek", { marketStory: true }).map((i) => i.rule)).not.toContain("crypto-shoehorn");
  });

  it("holds ledger copy to the record: no 'claimed', no characterising adjectives", () => {
    expect(rules("The minister claimed the scheme had cut waiting lists.", "ledger")).toContain("claimed");
    expect(rules("The figure is misleading.", "ledger")).toContain("ledger-adjective");
  });
});

describe("lintCopy — house-style copy passes", () => {
  it.each([
    "Two high-speed trains collide in Spain, killing at least 30",
    "Spain train collision: at least 30 dead",
    "Barclays to cut 5,000 jobs this year",
    "Israelis vote in first national election since October 7 attack",
    "Hackers heat French supermarket fridges, sparking fires and spoiling food",
  ])("headline %s", (headline) => {
    expect(hasStyleErrors(lintCopy(headline, "headline"))).toBe(false);
  });

  it.each([
    "Prime Minister Pedro Sánchez spoke about the collision as the reported death toll rose during the day.",
    "Also today: a Serbian police officer killed a knife attacker outside Israel's embassy in Belgrade, Reuters reported.",
    "The government said 4.2 million households would receive the £100 payment by March 2027.",
  ])("dek %s", (dek) => {
    expect(hasStyleErrors(lintCopy(dek, "dek"))).toBe(false);
  });

  it("does not treat a noun 'blast' as a loaded verb", () => {
    expect(rules("Ohio hazmat blast kills firefighter", "headline")).toEqual([]);
  });
});

describe("tidyHeadline / pickCleanCopy", () => {
  it("drops a trailing full stop and wrapping quotes, keeps abbreviations", () => {
    expect(tidyHeadline('"Barclays to cut 5,000 jobs."')).toBe("Barclays to cut 5,000 jobs");
    expect(tidyHeadline("Tariffs rise on steel from the U.S.")).toBe("Tariffs rise on steel from the U.S.");
  });

  it("picks the first candidate without errors", () => {
    const pick = pickCleanCopy(
      [
        "A Spanish train wreck leaves a mother's lullaby on the tracks while world leaders duel over votes and knives.",
        "Two high-speed trains collide in Spain, killing at least 30.",
      ],
      "headline",
    );
    expect(pick).toEqual({ text: "Two high-speed trains collide in Spain, killing at least 30", issues: [], rejected: false });
  });

  it("returns the least-bad candidate flagged as rejected when none pass", () => {
    const pick = pickCleanCopy(["When it rains, a stark reminder amid chaos", "A stark reminder"], "headline");
    expect(pick?.rejected).toBe(true);
    expect(pick?.text).toBe("A stark reminder");
  });

  it("returns null when there are no candidates", () => {
    expect(pickCleanCopy([null, "", undefined], "headline")).toBeNull();
  });
});
