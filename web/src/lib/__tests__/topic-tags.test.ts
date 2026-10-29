import { describe, expect, it } from "vitest";
import { assignTopicTags } from "../topic-tags";
import { topTags } from "../front";

// Headlines from the live feed on 2026-10-29, when Health showed stories that
// only contained the word "who".
describe("assignTopicTags", () => {
  it("does not read the word 'who' as the WHO", () => {
    expect(assignTopicTags("Deputies find bodies of missing college students who went hiking on treacherous mountain trail")).not.toContain("health");
    expect(assignTopicTags("Who benefits when massive AI data centers come to town?")).not.toContain("health");
    expect(assignTopicTags("DR Congo: WHO urges sustained efforts as Ebola cases top 10,000")).toContain("health");
  });

  it("tags health stories named in the headline", () => {
    expect(assignTopicTags("Trump admin eases access to unproven peptides favored by RFK Jr. despite FDA opposition")).toContain("health");
    expect(assignTopicTags("Mammograms can reveal risk for heart disease")).toContain("health");
  });

  it("matches whole words only", () => {
    expect(assignTopicTags("Astronomers Discover a Possible New Dwarf Planet in Our Solar System")).not.toContain("energy");
    expect(assignTopicTags("Investigations into Singapore palm oil firm find family ties to Borneo deforesters")).not.toContain("energy");
    expect(assignTopicTags("Google announces Gemini 4 Carbon, its latest frontier AI model")).not.toContain("climate");
    expect(assignTopicTags("Lib Dems and Reform UK in war of words over alleged shove")).not.toContain("war");
  });

  it("needs two standfirst mentions unless the term is strong", () => {
    const title = "Pakistan rights activist Imaan Mazari and husband jailed for 10 years";
    expect(assignTopicTags(title, "Couple say they are being made an example of by Pakistan's military-backed authorities.")).not.toContain("war");
    expect(assignTopicTags("At least 14 people killed in attack on Ukraine train station", "A Russian drone strike hit the station in Dnipro.")).toContain("war");
  });

  it("matches acronyms case-sensitively", () => {
    expect(assignTopicTags("Mistral releases the weights of its new AI model")).toContain("ai");
    expect(assignTopicTags("Ai Weiwei opens a show in Berlin")).not.toContain("ai");
  });
});

describe("topTags", () => {
  it("drops tags below the minimum count", () => {
    const items = [{ tags: ["war", "health"] }, { tags: ["war"] }, { tags: ["war"] }];
    expect(topTags(items, 6, 2)).toEqual(["war"]);
    expect(topTags(items, 6)).toEqual(["war", "health"]);
  });
});
