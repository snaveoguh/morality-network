import { describe, expect, it } from "vitest";
import type { FeedItem } from "../rss";
import { politicsReach, selectPoliticsSlides, sliderImageUrl, SLIDER_MAX, stripByline } from "../politics-slider";

const NOW = Date.parse("2026-10-30T12:00:00Z");
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toUTCString();

let seq = 0;
function item(
  title: string,
  opts: Partial<FeedItem> & { ageH?: number } = {},
): FeedItem {
  seq++;
  const { ageH = 1, ...extra } = opts;
  return {
    id: `p${seq}`,
    title,
    link: `https://example.com/p${seq}`,
    description: "",
    pubDate: hoursAgo(ageH),
    source: "Associated Press",
    sourceUrl: "https://example.com",
    category: "World",
    imageUrl: `https://img.example.com/p${seq}.jpg`,
    ...extra,
  };
}

describe("politicsReach: UK politics", () => {
  it.each([
    ["Why MPs keep talking about an early election despite Burnham's denials", "BBC Politics", "Politics"],
    ["Starmer stayed at Lord Alli's flat after leaving Downing Street", "The Telegraph", "World"],
    ["Chancellor U-Turns on Pledge to Bring Welfare Bill Down", "Guido Fawkes", "Politics"],
    ["Labour MPs demand police probe for Green Party's anti-Zionism motion", "The Canary", "Politics"],
    ["Badenoch says Tories will scrap the two-child cap", "The Guardian", "World"],
    ["Reform UK takes control of second county council", "Associated Press", "World"],
    ["Holyrood passes assisted dying bill at final stage", "BBC News", "World"],
    ["Healey's budget cuts mean Britain is likely to miss green heating targets", "Guardian Environment", "Environment"],
    ["UK sanctions Sudanese military leaders implicated in El Fasher 'campaign of rape'", "The Guardian", "World"],
    ["UK minister discusses tech collaboration in Greater Bay Area during Hong Kong visit", "SCMP", "World"],
    ["Budget 2026: Cautious or radical?", "New Statesman", "Politics"],
  ])("%s", (title, source, category) => {
    expect(politicsReach({ title, description: "", source, category })).not.toBeNull();
  });
});

describe("politicsReach: global politics relevant to the UK", () => {
  it.each([
    "Ukraine gets approval for Patriot missile sale",
    "G20 foreign ministers scrap 'family photo' as Lavrov crashes party",
    "NATO allies agree new air defence fund for Kyiv",
    "EU leaders back 90bn euro loan for Ukraine at Brussels summit",
    "Trump says Iran war will end 'soon'",
    "Israel and Hamas agree ceasefire extension in Gaza",
    "White House announces new tariffs on steel imports",
  ])("%s", (title) => {
    expect(politicsReach({ title, description: "", source: "Associated Press", category: "World" })).not.toBeNull();
  });
});

describe("politicsReach: excluded", () => {
  it.each<[string, Partial<FeedItem>]>([
    ["Premier League: Arsenal go top after late winner", { category: "World" }],
    ["England name squad for Six Nations opener", { category: "World" }],
    ["Bitcoin slides below $90,000 as ETF outflows mount", { category: "World" }],
    ["FTSE 100 hits record as Bank of England holds rates", { category: "World" }],
    ["Taylor Swift adds third Wembley date to UK tour", { category: "World" }],
    ["Market town fete returns after five-year break", { category: "World" }],
    ["Man jailed for murder of teenager in Leeds", { category: "World" }],
    ["Cruz warns GOP could lose 8 Senate seats, get swept in Texas", { category: "Politics", source: "The Hill" }],
    ["Time to set back the clocks, much to Trump's chagrin", { category: "Politics", source: "The Hill" }],
    ["After Shaming Conservatives for 'Seizing' on 'Rumors,' NYT Concedes", { category: "World", source: "Free Beacon" }],
    ["Treasury Department says Iran's economy cratering", { category: "Business", source: "The Hill" }],
    ["Japan's Prime Minister calls snap election", { category: "World", source: "BBC News" }],
    ["Canada's central labour union says workers will not handle military cargo", { category: "World" }],
    ["IRGC seizes second US reconnaissance drone over Qeshm Island", { category: "World", source: "Press TV" }],
    ["Should basic IQ tests be mandatory in order to vote?", { category: "Politics", source: "/pol/ - Politics" }],
    ["Britain's first £100m man facing defining moment", { category: "Sport", source: "BBC Sport" }],
    ["China's first AI-generated film flops at the box office", { category: "World" }],
    ["How to Transform Your Dining Room on a Budget: A Complete Guide", { category: "Politics", source: "The Canary" }],
    ["Singing the Election Blues", { category: "Politics", source: "National Review" }],
  ])("%s", (title, extra) => {
    expect(
      politicsReach({ title, description: "", source: extra.source ?? "Associated Press", category: extra.category ?? "World" }),
    ).toBeNull();
  });
});

describe("stripByline", () => {
  it("drops a Guardian opinion byline", () => {
    expect(stripByline("Opening the EU debate again is a political minefield | Simon Jenkins")).toBe(
      "Opening the EU debate again is a political minefield",
    );
    expect(stripByline("Labour's pre-election Budget")).toBe("Labour's pre-election Budget");
  });
});

describe("sliderImageUrl", () => {
  it("upgrades BBC thumbnails and http", () => {
    expect(sliderImageUrl("https://ichef.bbci.co.uk/ace/standard/240/cpsprodpb/ea75/live/x.jpg")).toBe(
      "https://ichef.bbci.co.uk/ace/standard/800/cpsprodpb/ea75/live/x.jpg",
    );
    expect(sliderImageUrl("http://cdn.example.com/a.jpg")).toBe("https://cdn.example.com/a.jpg");
  });
  it("rejects missing, audio and non-http images", () => {
    expect(sliderImageUrl(undefined)).toBeNull();
    expect(sliderImageUrl("https://traffic.libsyn.com/episode.mp3")).toBeNull();
    expect(sliderImageUrl("data:image/png;base64,AAAA")).toBeNull();
  });
});

describe("selectPoliticsSlides", () => {
  it("returns [] when fewer than three stories qualify", () => {
    const items = [
      item("Starmer allies brief against Burnham ahead of conference"),
      item("NATO allies agree new air defence fund for Kyiv"),
      item("Premier League: Arsenal go top after late winner"),
    ];
    expect(selectPoliticsSlides(items, SLIDER_MAX, NOW)).toEqual([]);
  });

  it("requires an image", () => {
    const items = [
      item("Starmer allies brief against Burnham ahead of conference", { imageUrl: undefined }),
      item("Reform UK takes control of second county council"),
      item("NATO allies agree new air defence fund for Kyiv"),
      item("Badenoch says Tories will scrap the two-child cap"),
    ];
    const slides = selectPoliticsSlides(items, SLIDER_MAX, NOW);
    expect(slides).toHaveLength(3);
    expect(slides.every((s) => s.imageUrl.startsWith("https://"))).toBe(true);
    expect(slides.map((s) => s.headline)).not.toContain("Starmer allies brief against Burnham ahead of conference");
  });

  it("dedupes near-identical headlines and builds article links", () => {
    const items = [
      item("Burnham rules out early general election", { source: "BBC Politics", category: "Politics" }),
      item("Burnham rules out early general election, says No 10", { source: "The Guardian" }),
      item("Reform UK takes control of second county council"),
      item("NATO allies agree new air defence fund for Kyiv"),
      item("Bitcoin slides below $90,000 as ETF outflows mount"),
    ];
    const slides = selectPoliticsSlides(items, SLIDER_MAX, NOW);
    expect(slides).toHaveLength(3);
    expect(slides.filter((s) => /early general election/.test(s.headline))).toHaveLength(1);
    for (const s of slides) expect(s.href).toBe(`/article/${s.id}`);
  });

  it("ranks fresh UK politics above older global stories and caps the count", () => {
    const items = [
      item("Israel and Hamas agree ceasefire extension in Gaza", { ageH: 2 }),
      item("Badenoch says Tories will scrap the two-child cap", { ageH: 2 }),
      ...[
        "NATO allies agree new air defence fund for Kyiv",
        "EU leaders back loan for Ukraine at Brussels summit",
        "White House announces new tariffs on steel imports",
        "Zelensky meets Macron and Merz in Paris",
        "G7 finance ministers discuss frozen Russian assets",
        "Iran rejects UN nuclear inspectors' request",
        "Taiwan holds drills after Chinese warships sighted",
        "Putin hosts Indian prime minister in Moscow",
      ].map((title, i) => item(title, { ageH: 6 + i })),
    ];
    const slides = selectPoliticsSlides(items, SLIDER_MAX, NOW);
    expect(slides).toHaveLength(SLIDER_MAX);
    expect(slides[0].headline).toMatch(/Badenoch/);
  });

  it("drops stories older than the window", () => {
    const items = [
      item("Reform UK takes control of second county council", { ageH: 120 }),
      item("Badenoch says Tories will scrap the two-child cap", { ageH: 120 }),
      item("NATO allies agree new air defence fund for Kyiv", { ageH: 120 }),
    ];
    expect(selectPoliticsSlides(items, SLIDER_MAX, NOW)).toEqual([]);
  });
});
