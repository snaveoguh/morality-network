import { describe, expect, it } from "vitest";
import { DEFAULT_FEEDS, HARDWARE_TRUST } from "../rss";
import { getSourceBias } from "../bias";
import { inTab } from "../front";

describe("hardware-trust auto-tag", () => {
  it.each([
    "Samsung smart TVs share viewing data with hundreds of partners",
    "Automatic content recognition is watching what you watch",
    "Tampered hardware wallets sold online leak seed phrases",
    "Counterfeit Trezor devices shipped with a hidden SIM card",
    "Researchers find firmware backdoor in budget Android phones",
    "Supply-chain attack hits router maker",
    "UEFI bootkit survives OS reinstall",
    "Why open silicon and RISC-V matter for verifiable hardware",
    "Pre-installed malware found on cheap TV boxes",
    "Ledger Nano recovery service draws criticism",
    "Google dismantles botnet secretly running on 1.3 million Android TV boxes",
    "UEFI bootkit infected fully patched Windows machines",
  ])("tags %s", (title) => {
    expect(HARDWARE_TRUST.test(title)).toBe(true);
  });

  it.each([
    "MPs accuse minister of backdoor privatisation of the NHS",
    "Claim Ledger: what the PM said at PMQs",
    "Allegations of election tampering dismissed by court",
    "Cold storage warehouse fire in Leeds",
    "Supply chain delays push up food prices",
    "Smart motorways to be scrapped",
  ])("leaves %s alone", (title) => {
    expect(HARDWARE_TRUST.test(title)).toBe(false);
  });
});

describe("hardware trust sources", () => {
  it("every Security source has a bias rating", () => {
    const security = DEFAULT_FEEDS.filter((f) => f.category === "Security");
    expect(security.length).toBeGreaterThanOrEqual(6);
    for (const f of security) {
      expect(getSourceBias(f.url) ?? getSourceBias(f.name), f.name).not.toBeNull();
    }
  });
});

describe("inTab", () => {
  const latest = { categories: [] };
  const tech = { categories: ["Tech"] };
  const beat = { categories: [], tags: ["hardware-trust"] };

  it("Latest takes everything", () => {
    expect(inTab(latest, { category: "Sport", tags: [] })).toBe(true);
  });
  it("a category tab takes its categories", () => {
    expect(inTab(tech, { category: "Tech", tags: [] })).toBe(true);
    expect(inTab(tech, { category: "World", tags: [] })).toBe(false);
  });
  it("a beat tab takes tagged stories from any category", () => {
    expect(inTab(beat, { category: "World", tags: ["hardware-trust"] })).toBe(true);
    expect(inTab(beat, { category: "Security", tags: ["security"] })).toBe(false);
  });
});
