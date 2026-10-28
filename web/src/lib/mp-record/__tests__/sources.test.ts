// Parser tests against real register responses captured 2026-10-28
// (fixtures/: Members API, Register of Interests, Electoral Commission export
// for Sir James Cleverly, member 4366 — public register data).

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseMoneyToPence } from "../parse-utils";
import { parseBiography, parseMember } from "../sources/members";
import { counterpartyKindFromStatus, parseInterestsPage } from "../sources/interests";
import { ecSearchName, parseEcCsv, parseEcTotal, proposeEcLinks } from "../sources/electoral-commission";

const fx = (name: string) => readFileSync(path.join(__dirname, "fixtures", name), "utf8");
const json = (name: string) => JSON.parse(fx(name));

describe("members parser", () => {
  it("parses identity verbatim with provenance", () => {
    const rec = parseMember(json("member-4366.json"), 7);
    expect(rec.table).toBe("mp_members");
    expect(rec.scopeKey).toBe("member:4366");
    expect(rec.sourceRecordId).toBe("4366");
    expect(rec.rawFetchId).toBe(7);
    expect(rec.sourceUrl).toBe("https://members.parliament.uk/member/4366");
    expect(rec.sourceApiUrl).toBe("https://members-api.parliament.uk/api/Members/4366");
    expect(rec.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(rec.data).toMatchObject({
      memberId: 4366,
      nameDisplay: "Sir James Cleverly",
      nameFullTitle: "Rt Hon Sir James Cleverly MP",
      house: "Commons",
      latestPartyName: "Conservative",
      constituencyName: "Braintree",
      membershipStartDate: "2015-05-07",
      statusIsActive: true,
    });
  });

  it("rejects a payload that is not a member", () => {
    expect(() => parseMember({ value: null })).toThrow();
    expect(() => parseMember({ error: "x" })).toThrow();
  });

  it("parses dated party, seat, post and committee periods with unique ids", () => {
    const periods = parseBiography(json("biography-4366.json"), 4366);
    const ids = periods.map((p) => p.sourceRecordId);
    expect(new Set(ids).size).toBe(ids.length);
    const home = periods.find((p) => p.data.kind === "government_post" && p.data.name === "Home Secretary");
    expect(home?.data).toMatchObject({ startDate: "2023-11-13", endDate: "2024-07-05", additionalInfo: "Home Office" });
    expect(home?.sourceRecordId).toBe("government_post:74:2023-11-13");
    const party = periods.filter((p) => p.data.kind === "party");
    expect(party.map((p) => [p.data.name, p.data.startDate, p.data.endDate])).toEqual([["Conservative", "2015-05-07", null]]);
    expect(periods.filter((p) => p.data.kind === "constituency").length).toBe(2);
  });

  it("disambiguates exact repeats deterministically", () => {
    const item = { house: 1, name: "X", id: 9, startDate: "2020-01-01T00:00:00", endDate: null };
    const periods = parseBiography({ value: { committeeMemberships: [item, { ...item, endDate: "2021-01-01T00:00:00" }] } }, 1);
    expect(periods.map((p) => p.sourceRecordId)).toEqual(["committee:9:2020-01-01", "committee:9:2020-01-01:2"]);
  });
});

describe("interests parser", () => {
  const page = parseInterestsPage(json("interests-4366-p0.json"), 11);
  const byId = (id: number) => page.records.find((r) => r.data.interestId === id)!;

  it("flattens child payments and counts top-level entries for completeness", () => {
    expect(page.totalResults).toBe(5);
    expect(page.topLevelCount).toBe(5);
    expect(page.records.length).toBe(11);
    expect(page.records.every((r) => r.data.memberId === 4366 && r.scopeKey === "member:4366")).toBe(true);
  });

  it("keeps register wording and every field verbatim", () => {
    const parent = byId(12649);
    expect(parent.data.summary).toBe("Speaking engagements - JLA Speakers Ltd");
    expect(parent.data.categoryNumber).toBe("1");
    expect(parent.data.payerOrDonorName).toBe("JLA Speakers Ltd");
    expect(parent.data.counterpartyKind).toBe("organisation"); // PayerIsPrivateIndividual = false
    expect(parent.data.fields.find((f) => f.name === "PayerNatureOfBusiness")?.value).toBe("Speaking agency");
    expect(parent.data.valueGbp).toBeNull();
    expect(parent.sourceApiUrl).toBe("https://interests-api.parliament.uk/api/v1/Interests/12649");
    expect(parent.sourceUrl).toBe("https://members.parliament.uk/member/4366/registeredinterests");
  });

  it("gives child payments their exact value and the payer named on the parent", () => {
    const child = byId(14246);
    expect(child.data).toMatchObject({
      parentInterestId: 12649,
      categoryNumber: "1.1",
      valueGbp: "5950.00",
      valueCurrency: "GBP",
      receivedDate: "2025-12-19",
      registrationDate: "2026-01-05",
      payerOrDonorName: "JLA Speakers Ltd",
      payerFromParent: true,
      isRegularPayment: false,
    });
  });

  it("flags category 1.2 values as per-period", () => {
    expect(byId(14270).data).toMatchObject({ categoryNumber: "1.2", isRegularPayment: true, valueGbp: "52000.00" });
  });

  it("records the API gap for visits as absence, not zero", () => {
    expect(byId(14684).data).toMatchObject({ categoryNumber: "4", valueGbp: null, payerOrDonorName: null });
  });

  it("keeps updated dates", () => {
    expect(byId(1387).data.updatedDates).toEqual(["2016-10-27"]);
  });

  it("rejects a non-page payload", () => {
    expect(() => parseInterestsPage({ items: "x" })).toThrow();
  });

  it("never treats family members as counterparties", () => {
    const p = parseInterestsPage({
      totalResults: 1,
      items: [{
        id: 1, summary: "s", category: { id: 10, number: "9", name: "Family members employed" },
        member: { id: 2 }, fields: [{ name: "PersonName", value: "A Relative" }],
      }],
    });
    expect(p.records[0].data.payerOrDonorName).toBeNull();
  });

  it("maps donor status deterministically", () => {
    expect(counterpartyKindFromStatus("Individual")).toBe("person");
    expect(counterpartyKindFromStatus("Company")).toBe("organisation");
    expect(counterpartyKindFromStatus("Trade Union")).toBe("organisation");
    expect(counterpartyKindFromStatus("Other")).toBe("unknown");
    expect(counterpartyKindFromStatus(null)).toBe("unknown");
  });
});

describe("Electoral Commission parser", () => {
  const csvUrl = "https://search.electoralcommission.org.uk/api/csv/Donations?x";
  const exp = parseEcCsv(fx("ec-4366.csv"), csvUrl, 3);

  it("parses the export with exact values and UK dates", () => {
    expect(parseEcTotal(json("ec-total-4366.json"))).toBe(35);
    expect(exp.totalRows).toBe(35);
    expect(exp.unparseableRows).toBe(0);
    const v = exp.mpDoneeRecords.find((r) => r.sourceRecordId === "V0836181")!;
    expect(v.data).toMatchObject({
      regulatedEntityId: 2863,
      regulatedEntityName: "James Cleverly MP",
      donorName: "USC Schwarzenegger Institute for State and Global Policy",
      donorStatus: "Other",
      counterpartyKind: "unknown",
      valueGbp: "23858.89",
      donationType: "Visit",
      acceptedDate: "2026-01-29",
      reportedDate: "2026-03-05",
      receivedDate: null,
      isSponsorship: false,
    });
    expect(v.data.rawRow.Value).toBe("£23,858.89"); // export row kept verbatim
    expect(v.scopeKey).toBe("ec-entity:2863");
    expect(v.sourceUrl).toBe("https://search.electoralcommission.org.uk/English/Donations/V0836181");
  });

  it("sums the export exactly", () => {
    const pence = exp.mpDoneeRecords.reduce((a, r) => a + parseMoneyToPence(r.data.valueGbp)!, 0);
    expect(pence).toBe(34932824); // £349,328.24, cross-checked with Python Decimal
  });

  it("proposes (never confirms) a link only on an exact normalised name", () => {
    const { proposals, unmatchedEntities } = proposeEcLinks(4366, "Sir James Cleverly", exp.mpDoneeRecords);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ externalId: "2863", confidence: "high", matchMethod: "rule:ec-exact-name-v1" });
    expect(unmatchedEntities).toEqual([]);
    expect(proposeEcLinks(9999, "Sir James Clever", exp.mpDoneeRecords).proposals).toHaveLength(0);
  });

  it("searches with the display name minus honorifics", () => {
    expect(ecSearchName("Sir James Cleverly")).toBe("James Cleverly");
    expect(ecSearchName("Dr Rosena Allin-Khan")).toBe("Rosena Allin Khan");
  });

  it("rejects a total-less response", () => {
    expect(() => parseEcTotal({})).toThrow();
  });
});
