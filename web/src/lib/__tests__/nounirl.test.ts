import { describe, expect, it } from "vitest";
import {
  buildNounIrlAgentSnapshot,
  normalizeNounIrlWatching,
} from "../agents/nounirl";

describe("buildNounIrlAgentSnapshot", () => {
  it("maps live NounIRL status, prediction, and reservations into bot-card data", () => {
    const snapshot = buildNounIrlAgentSnapshot({
      bridgeTopics: ["trade-candidate"],
      bridgeUrl: "https://noun.example",
      siteUrl: "https://pooter.world",
      statusPayload: {
        running: true,
        lastBlock: 24651546,
        wallet: "0xACc74B39976D50522621F54c18dC85E2822Ec22c",
        transport: "websocket",
        bridge: "connected",
        lastCheckedAt: 1773441048,
        reservations: {
          total: 2,
          totalSettlements: 0,
        },
      },
      predictPayload: {
        block: 24651574,
        nextNounId: 1844,
        checkedAt: 1773441384,
        running: true,
        traits: {
          background: "Warm",
          body: "Blue sky",
          accessory: "Oldshirt",
          head: "Pie",
          glasses: "Fullblack",
        },
      },
      reservationsPayload: {
        reservations: [
          {
            status: "active",
            traits: ["head:hair"],
          },
          {
            status: "cancelled",
            traits: ["glasses:green"],
          },
        ],
      },
    });

    expect(snapshot.status).toBe("running");
    expect(snapshot.stats.currentBlock).toBe(24651574);
    expect(snapshot.stats.nextNoun).toBe(1844);
    expect(snapshot.stats.reservations).toBe(2);
    expect(snapshot.nounirl.block).toBe(24651574);
    expect(snapshot.nounirl.nextNounId).toBe(1844);
    expect(snapshot.nounirl.checkedAt).toBe(1773441384000);
    expect(snapshot.nounirl.traits.map((trait) => trait.label)).toEqual([
      "Warm",
      "Blue sky",
      "Oldshirt",
      "Pie",
      "Fullblack",
    ]);
    expect(snapshot.nounirl.watching).toEqual([
      {
        key: "head:hair",
        category: "head",
        label: "Hair",
        shortLabel: "HD",
      },
    ]);
  });
});

describe("normalizeNounIrlWatching", () => {
  it("dedupes active watched traits across reservation payload shapes", () => {
    const watching = normalizeNounIrlWatching(
      {
        reservations: [
          { status: "active", traits: ["head:hair", "head:hair"] },
          { status: "pending", traits: ["accessory:ice-cold"] },
          { status: "cancelled", traits: ["body:blue-sky"] },
        ],
      },
      ["head:hair", "watch:pie"],
    );

    expect(watching).toEqual([
      {
        key: "head:hair",
        category: "head",
        label: "Hair",
        shortLabel: "HD",
      },
      {
        key: "accessory:ice cold",
        category: "accessory",
        label: "Ice Cold",
        shortLabel: "AC",
      },
      {
        key: "watch:pie",
        category: "watch",
        label: "Pie",
        shortLabel: "WA",
      },
    ]);
  });
});
