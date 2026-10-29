import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  DATA_INDICATORS,
  NEWS_INDICATORS,
  REGIONS,
  classifyDisruption,
  type DataIndicatorDef,
} from "../bearometer/global-supply-taxonomy";
import {
  compareSeries,
  scoreDataIndicator,
  scoreNewsIndicator,
  scoreRegions,
  type RawGlobalNewsItem,
  type SeriesPoint,
} from "../bearometer/global-supply-score";
import { parseEiaSprHtml, parseFaoCsv, parseOecdCsv } from "../bearometer/global-supply-fetchers";

const NOW = Date.parse("2026-10-29T12:00:00Z");

const def = (id: string): DataIndicatorDef => DATA_INDICATORS.find((d) => d.id === id)!;

function daily(values: number[], endDate = "2026-10-28"): SeriesPoint[] {
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return values.map((value, i) => ({
    date: new Date(end - (values.length - 1 - i) * 86_400_000).toISOString().slice(0, 10),
    value,
  }));
}

function news(indicatorId: string, title: string, overrides: Partial<RawGlobalNewsItem> = {}): RawGlobalNewsItem {
  return {
    indicatorId,
    id: title,
    title,
    description: "",
    link: `https://example.com/${encodeURIComponent(title)}`,
    pubDate: "2026-10-29T06:00:00Z",
    source: "Reuters",
    sourceKind: "aggregator",
    ...overrides,
  };
}

describe("taxonomy", () => {
  it("gives every indicator a known region, a source URL, a reason and assets", () => {
    const regionIds = new Set(REGIONS.map((r) => r.id));
    for (const d of DATA_INDICATORS) {
      expect(regionIds.has(d.region), d.id).toBe(true);
      expect(d.sourceUrl, d.id).toMatch(/^https:\/\//);
      expect(d.why.length, d.id).toBeGreaterThan(20);
      expect(d.assets.length, d.id).toBeGreaterThan(0);
    }
    for (const n of NEWS_INDICATORS) {
      expect(regionIds.has(n.region), n.id).toBe(true);
      expect(n.assets.length, n.id).toBeGreaterThan(0);
    }
    const ids = [...DATA_INDICATORS, ...NEWS_INDICATORS].map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers every region with at least one indicator", () => {
    for (const region of REGIONS) {
      const count =
        DATA_INDICATORS.filter((d) => d.region === region.id).length +
        NEWS_INDICATORS.filter((n) => n.region === region.id).length;
      expect(count, region.id).toBeGreaterThan(0);
    }
  });
});

describe("compareSeries", () => {
  it("compares the latest point with the mean of the window before it", () => {
    const r = compareSeries(daily([...Array(63).fill(100), 120]), { kind: "pct-vs-mean", window: 63, scale: 0.2, versus: "" });
    expect(r).toEqual({ latest: 120, baseline: 100, change: 0.2 });
  });

  it("refuses a series shorter than half the window", () => {
    expect(compareSeries(daily([100, 100, 120]), { kind: "pct-vs-mean", window: 63, scale: 0.2, versus: "" })).toBeNull();
  });

  it("handles first-vs-last, lag and level comparisons", () => {
    expect(compareSeries(daily([40, 10]), { kind: "pct-vs-first", scale: 0.25, versus: "" })?.change).toBe(-0.75);
    const monthly = Array.from({ length: 13 }, (_, i) => ({ date: `2025-${i}`, value: 100 + i }));
    expect(compareSeries(monthly, { kind: "pct-vs-lag", lag: 12, scale: 0.1, versus: "" })?.change).toBeCloseTo(0.12);
    expect(compareSeries(daily([98.5]), { kind: "level-vs", reference: 100, scale: 1.5, versus: "" })).toEqual({
      latest: 98.5,
      baseline: 100,
      change: -1.5,
    });
  });
});

describe("scoreDataIndicator", () => {
  it("reads a collapse in Hormuz transits as strain", () => {
    const r = scoreDataIndicator(def("hormuz-transits"), daily([40, 3.5]), NOW);
    expect(r.label).toBe("STRAINED");
    expect(r.pressure).toBeGreaterThan(0.9);
    expect(r.change).toBeCloseTo(-0.9125);
  });

  it("reads more ships round the Cape as strain (rerouting), not relief", () => {
    const r = scoreDataIndicator(def("cape-transits"), daily([50, 86]), NOW);
    expect(r.label).toBe("STRAINED");
  });

  it("reads factory confidence below 100 as strain and above 100 as easing", () => {
    expect(scoreDataIndicator(def("bci-mexico"), [{ date: "2026-09", value: 98.4 }], NOW).label).toBe("STRAINED");
    expect(scoreDataIndicator(def("bci-us"), [{ date: "2026-09", value: 100.6 }], NOW).label).toBe("EASING");
    expect(scoreDataIndicator(def("bci-japan"), [{ date: "2026-09", value: 100.2 }], NOW).label).toBe("STEADY");
  });

  it("marks old monthly data STALE and keeps it out of the region score", () => {
    const r = scoreDataIndicator(def("bci-india"), [{ date: "2026-02", value: 95.4 }], NOW);
    expect(r.stale).toBe(true);
    expect(r.label).toBe("STALE");
  });

  it("does not call last month's figure stale on the first of the next month", () => {
    const r = scoreDataIndicator(def("fao-food-price-index"), [
      ...Array.from({ length: 12 }, (_, i) => ({ date: `2025-${String(i + 1).padStart(2, "0")}`, value: 120 })),
      { date: "2026-09", value: 136 },
    ], Date.parse("2026-11-01T00:00:00Z"));
    expect(r.stale).toBe(false);
  });

  it("returns NO DATA for a missing series", () => {
    const r = scoreDataIndicator(def("brent-crude"), null, NOW);
    expect(r.label).toBe("NO DATA");
    expect(r.pressure).toBe(0);
  });
});

describe("classifyDisruption", () => {
  it("reads attacks, strikes, closures and bans as disrupting", () => {
    expect(classifyDisruption("Houthi missile hits tanker in Red Sea")).toBe("disrupting");
    expect(classifyDisruption("Dockworkers strike shuts Rotterdam container terminal")).toBe("disrupting");
    expect(classifyDisruption("Indonesia weighs nickel export ban")).toBe("disrupting");
    expect(classifyDisruption("Panama Canal cuts daily transits as drought lowers Gatun Lake")).toBe("disrupting");
    expect(classifyDisruption("Glencore cobalt output halves as Congo quotas bite")).toBe("disrupting");
  });

  it("does not read drone-based monitoring as an attack", () => {
    expect(classifyDisruption("Firm supports drone-based mine monitoring in Zambia")).toBe("neutral");
  });

  it("reads reopenings, resumptions and ceasefires as easing", () => {
    expect(classifyDisruption("Odesa ports resume grain shipments")).toBe("easing");
    expect(classifyDisruption("Port strike ends after wage deal")).toBe("easing");
    expect(classifyDisruption("Container rates fall for third week")).toBe("easing");
    expect(classifyDisruption("Nickel surplus grows as Indonesian mines expand")).toBe("easing");
  });

  it("does not read a call to reopen as a reopening", () => {
    expect(classifyDisruption("UN urges Russia to reopen Black Sea grain corridor after attack")).toBe("disrupting");
  });

  it("is neutral without a direction cue", () => {
    expect(classifyDisruption("TSMC reports quarterly results")).toBe("neutral");
  });
});

describe("scoreNewsIndicator", () => {
  const redSea = NEWS_INDICATORS.find((n) => n.id === "red-sea-gulf-news")!;

  it("scores only its own, on-topic, recent items and dedupes repeats", () => {
    const r = scoreNewsIndicator(
      redSea,
      [
        news("red-sea-gulf-news", "Houthis attack tanker in Red Sea - Reuters"),
        news("red-sea-gulf-news", "Houthis attack tanker in Red Sea - AP"),
        news("red-sea-gulf-news", "Tankers divert from Strait of Hormuz"),
        news("red-sea-gulf-news", "Football club signs striker"), // off-topic
        news("black-sea-news", "Red Sea shipping attacked"), // another indicator's sweep
        news("red-sea-gulf-news", "Old Red Sea attack", { pubDate: "2026-08-01T00:00:00Z" }),
      ],
      NOW,
    );
    expect(r.itemCount).toBe(2);
    expect(r.disruptingCount).toBe(2);
    expect(r.label).toBe("STRAINED");
  });

  it("returns NO DATA with no items", () => {
    expect(scoreNewsIndicator(redSea, [], NOW).label).toBe("NO DATA");
  });
});

describe("scoreRegions", () => {
  it("averages fresh readings per region and returns every region", () => {
    const regions = scoreRegions(
      {
        "hormuz-transits": daily([40, 4]),
        "suez-transits": daily([40, 40]),
        "bci-india": [{ date: "2026-02", value: 90 }],
      },
      [],
      NOW,
    );
    expect(regions.map((r) => r.region.id)).toEqual(REGIONS.map((r) => r.id));

    const me = regions.find((r) => r.region.id === "middle-east")!;
    expect(me.scoredCount).toBe(2);
    const hormuz = me.data.find((d) => d.def.id === "hormuz-transits")!;
    expect(me.pressure).toBeCloseTo(hormuz.pressure / 2);

    const ssa = regions.find((r) => r.region.id === "south-southeast-asia")!;
    expect(ssa.scoredCount).toBe(0);
    expect(ssa.label).toBe("NO DATA");
  });
});

describe("parsers", () => {
  it("parses the OECD SDMX CSV by column name", () => {
    const csv = [
      "DATAFLOW,REF_AREA,FREQ,MEASURE,UNIT_MEASURE,ACTIVITY,ADJUSTMENT,TRANSFORMATION,TIME_HORIZ,METHODOLOGY,TIME_PERIOD,OBS_VALUE,OBS_STATUS",
      "OECD.SDD.STES:DSD_STES@DF_CLI(4.1),USA,M,BCICP,IX,_Z,AA,IX,_Z,H,2026-09,100.3444,A",
      "OECD.SDD.STES:DSD_STES@DF_CLI(4.1),USA,M,BCICP,IX,_Z,AA,IX,_Z,H,2026-08,100.1,A",
      "OECD.SDD.STES:DSD_STES@DF_CLI(4.1),MEX,M,BCICP,IX,_Z,AA,IX,_Z,H,2026-09,98.38864,A",
    ].join("\n");
    const out = parseOecdCsv(csv);
    expect(out.get("USA")).toEqual([
      { date: "2026-08", value: 100.1 },
      { date: "2026-09", value: 100.3444 },
    ]);
    expect(out.get("MEX")?.[0].value).toBeCloseTo(98.38864);
  });

  it("parses the FAO CSV, skipping title rows", () => {
    const csv = [
      "FAO Food Price Index,,,",
      "2014-2016=100,,,",
      "Date,Food Price Index,Meat,Dairy",
      ",,,",
      "2026-08,134.0,129.3,119.2",
      "2026-09,136.0,127.9,119.1",
    ].join("\r\n");
    expect(parseFaoCsv(csv)).toEqual([
      { date: "2026-08", value: 134 },
      { date: "2026-09", value: 136 },
    ]);
  });

  it("parses the EIA SPR history table into million barrels", () => {
    const html = `
 <tr>
 <td class='B6'>&nbsp;&nbsp;2026-Oct</td>
 <td class='B5'>10/16&nbsp;</td>
 <td class='B3'>282,683&nbsp;&nbsp;&nbsp;</td>
 <td class='B5'>10/23&nbsp;</td>
 <td class='B3'>282,583&nbsp;&nbsp;&nbsp;</td>
 <td class='B5'>&nbsp;</td>
 <td class='B3'>&nbsp;&nbsp;&nbsp;</td>
 </tr>`;
    expect(parseEiaSprHtml(html)).toEqual([
      { date: "2026-10-16", value: 282.683 },
      { date: "2026-10-23", value: 282.583 },
    ]);
  });
});
