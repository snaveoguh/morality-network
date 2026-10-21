import { describe, expect, it } from "vitest";
import {
  computeCorrectionsStats,
  daysBetween,
  dedupeJointStatements,
  extractOriginalDate,
  isCorrectionTitle,
  isOralSelfCorrection,
  median,
  parseCorrectionStatement,
  parsePointOfOrderCandidate,
  parseWrittenQuestionCorrection,
  referencedUin,
  splitSaidShouldHaveSaid,
  type MinisterialCorrection,
  type RawSpokenContribution,
  type RawWrittenQuestion,
  type RawWrittenStatement,
} from "../corrections";

// Fixtures trimmed from real questions-statements-api / Hansard payloads.

function wq(overrides: Partial<RawWrittenQuestion> = {}): RawWrittenQuestion {
  return {
    id: 1933528,
    house: "Commons",
    uin: "23043",
    dateTabled: "2026-08-28T00:00:00",
    dateAnswered: "2026-09-08T00:00:00",
    dateAnswerCorrected: "2026-10-20T00:00:00",
    answerIsCorrection: true,
    answeringBodyName: "Ministry of Housing, Communities and Local Government",
    heading: "Nesil Caliskan",
    questionText: "To ask the Secretary of State …",
    answerText:
      "<p></p><p>The former Parliamentary Under-Secretary of State … was eligible for and has received a severance payment.</p>",
    originalAnswerText:
      "<p>The former Parliamentary Under-Secretary of State … was not entitled to and did not receive a severance payment.</p><p></p></ins></p>",
    answeringMemberId: 4569,
    answeringMember: { id: 4569, name: "Jim McMahon", partyAbbreviation: "Lab" },
    correctingMemberId: 4569,
    correctingMember: { id: 4569, name: "Jim McMahon", partyAbbreviation: "Lab" },
    ...overrides,
  };
}

function wms(overrides: Partial<RawWrittenStatement> = {}): RawWrittenStatement {
  return {
    id: 1895322,
    memberId: 4268,
    member: { id: 4268, name: "Steve Reed", partyAbbreviation: "Lab" },
    memberRole: "Secretary of State for Housing, Communities and Local Government",
    uin: "HCWS1485",
    dateMade: "2026-03-26T00:00:00",
    answeringBodyName: "Ministry of Housing, Communities and Local Government",
    title: "Correction to Written Statement HCWS1455",
    text:
      "<p>On 25 March I made a written statement on Local Government Reorganisation. There was a minor error in the statement. It said:</p><ul><li>“Central and Eastern Suffolk Council (current local government areas of West Suffolk).”</li></ul><p>It should have said:</p><ul><li>“Western Suffolk Council (current local government areas of West Suffolk).”</li></ul>",
    house: "Commons",
    linkedStatements: [
      { linkedStatementId: 1894683, linkType: "CorrectedStatement", linkDate: "2026-03-25T00:00:00" },
      { linkedStatementId: 1895325, linkType: "JointStatement", linkDate: "2026-03-26T00:00:00" },
    ],
    ...overrides,
  };
}

describe("written answer corrections", () => {
  it("parses dates, member, department and both texts", () => {
    const c = parseWrittenQuestionCorrection(wq())!;
    expect(c.id).toBe("wq:1933528");
    expect(c.kind).toBe("written-answer");
    expect(c.correctedOn).toBe("2026-10-20");
    expect(c.originalDate).toBe("2026-09-08");
    expect(c.daysToCorrect).toBe(42);
    expect(c.member).toMatchObject({ memberId: 4569, name: "Jim McMahon", party: "Lab" });
    expect(c.department).toMatch(/Housing/);
    expect(c.originalText).toMatch(/did not receive/);
    expect(c.originalText).not.toMatch(/</);
    expect(c.correctedText).toMatch(/has received/);
    expect(c.correctionUrl).toBe(
      "https://questions-statements.parliament.uk/written-questions/detail/2026-08-28/23043",
    );
    expect(c.needsReview).toBe(false);
  });

  it("rejects answers that are not corrections", () => {
    expect(parseWrittenQuestionCorrection(wq({ answerIsCorrection: false }))).toBeNull();
    expect(parseWrittenQuestionCorrection(wq({ dateAnswerCorrected: null }))).toBeNull();
  });

  it("prefers the correcting member over the original answerer", () => {
    const c = parseWrittenQuestionCorrection(
      wq({ correctingMemberId: 99, correctingMember: { id: 99, name: "New Minister", partyAbbreviation: "Lab" } }),
    )!;
    expect(c.member.name).toBe("New Minister");
    expect(c.member.memberId).toBe(99);
  });
});

describe("correction statements", () => {
  it("takes the original date from the CorrectedStatement link", () => {
    const c = parseCorrectionStatement(wms(), { uin: "HCWS1455", dateMade: "2026-03-25T00:00:00" })!;
    expect(c.id).toBe("wms:HCWS1485");
    expect(c.originalDate).toBe("2026-03-25");
    expect(c.daysToCorrect).toBe(1);
    expect(c.originalRef).toBe("HCWS1455");
    expect(c.originalUrl).toBe(
      "https://questions-statements.parliament.uk/written-statements/detail/2026-03-25/HCWS1455",
    );
    expect(c.originalText).toMatch(/^Central and Eastern Suffolk/);
    expect(c.correctedText).toMatch(/^Western Suffolk/);
    expect(c.member.role).toMatch(/Secretary of State/);
  });

  it("uses an embedded Hansard link for oral-question corrections", () => {
    const c = parseCorrectionStatement(
      wms({
        uin: "HLWS366",
        house: "Lords",
        dateMade: "2026-10-12T00:00:00",
        title: "Correction to Oral Question: Gaelic Broadcasting",
        linkedStatements: null,
        text:
          '<p>On 16 July 2026, I <a href="https://hansard.parliament.uk/lords/2026-07-16/debates/20EB/BBCRoyalCharter#contribution-866C" target="_blank">answered an Oral Question</a>. I said: “MG ALBA’s total budget stands at an estimated £420 per Gaelic speaker”.</p><p>A more accurate statistic using updated population figures is: “MG ALBA\'s total budget stands at an estimated £358.68 per Gaelic speaker”.</p>',
      }),
    )!;
    expect(c.originalDate).toBe("2026-07-16");
    expect(c.daysToCorrect).toBe(88);
    expect(c.originalUrl).toMatch(/^https:\/\/hansard\.parliament\.uk\/lords\/2026-07-16\//);
    expect(c.originalText).toMatch(/£420/);
    expect(c.correctedText).toMatch(/£358\.68/);
    expect(c.needsReview).toBe(false);
  });

  it("flags statements with no recoverable original date for review", () => {
    const c = parseCorrectionStatement(
      wms({ linkedStatements: null, text: "<p>There was an error in a previous answer.</p>", title: "Ministerial correction" }),
    )!;
    expect(c.originalDate).toBeNull();
    expect(c.daysToCorrect).toBeNull();
    expect(c.needsReview).toBe(true);
  });

  it("ignores statements whose title is not a correction", () => {
    expect(parseCorrectionStatement(wms({ title: "Finance Bill: Draft Legislation" }))).toBeNull();
    expect(isCorrectionTitle("Correctional Services Update")).toBe(false);
    expect(isCorrectionTitle("Corrections regarding PPE procurement")).toBe(true);
  });

  it("collapses the Lords copy of a joint statement into the Commons one", () => {
    const commons = wms();
    const lords = wms({
      id: 1895325,
      uin: "HLWS1487",
      house: "Lords",
      linkedStatements: [{ linkedStatementId: 1895322, linkType: "JointStatement", linkDate: "2026-03-26T00:00:00" }],
    });
    const rows = [lords, commons].map((raw) => ({ raw, parsed: parseCorrectionStatement(raw)! }));
    const out = dedupeJointStatements(rows);
    expect(out).toHaveLength(1);
    expect(out[0].house).toBe("Commons");
    expect(out[0].alsoLaidIn).toBe("Lords");
  });
});

describe("prose helpers", () => {
  it("extracts explicit, year-less and relative original dates", () => {
    expect(extractOriginalDate("On 16 July 2026, I answered", "2026-10-12")).toBe("2026-07-16");
    expect(extractOriginalDate("On 25 March I made a statement", "2026-03-26")).toBe("2026-03-25");
    // Year-less date later in the year than the correction → previous year.
    expect(extractOriginalDate("On 3 December I said", "2026-02-10")).toBe("2025-12-03");
    expect(extractOriginalDate("the statement I made today titled X", "2026-05-14")).toBe("2026-05-14");
    expect(extractOriginalDate("at oral questions yesterday", "2026-05-14")).toBe("2026-05-13");
    expect(extractOriginalDate("in a previous answer", "2026-05-14")).toBeNull();
  });

  it("splits what was said from what should have been said", () => {
    const r = splitSaidShouldHaveSaid(
      "I said: “there are 4,000 new officers on the beat today”. I should have said: “there are 3,000 new officers on the beat today”.",
    );
    expect(r.said).toBe("there are 4,000 new officers on the beat today");
    expect(r.shouldHaveSaid).toBe("there are 3,000 new officers on the beat today");
  });

  it("reads referenced UINs from titles", () => {
    expect(referencedUin("Correction to PQ HL16235")).toBe("HL16235");
    expect(referencedUin("Correction to Written Statement HCWS1455")).toBe("HCWS1455");
    expect(referencedUin("Ministerial correction")).toBeNull();
  });

  it("computes whole-day gaps across month ends", () => {
    expect(daysBetween("2026-01-31", "2026-03-01")).toBe(29);
  });
});

describe("oral self-correction candidates", () => {
  it("accepts first-person corrections on a point of order", () => {
    expect(isOralSelfCorrection("On a point of order, Mr Speaker. This week I misspoke and mistakenly attributed comments.")).toBe(true);
    expect(isOralSelfCorrection("On a point of order. I would like to correct an inadvertent error I made earlier today.")).toBe(true);
    expect(isOralSelfCorrection("Further to that point of order. I think I said that 17 prisoners a month were released; that was incorrect.")).toBe(true);
  });

  it("rejects requests that SOMEONE ELSE correct the record", () => {
    expect(isOralSelfCorrection("On a point of order. I think the Minister may have inadvertently misled the House.")).toBe(false);
    expect(isOralSelfCorrection("On a point of order. I believe the Prime Minister has inadvertently misled the House.")).toBe(false);
    expect(isOralSelfCorrection("I inadvertently said the wrong figure.")).toBe(false); // not a point of order
  });

  it("rejects register-of-interests rectifications", () => {
    expect(
      isOralSelfCorrection("On a point of order. I would like to apologise for failing to declare an interest; I inadvertently omitted it."),
    ).toBe(false);
  });

  it("builds a review-flagged candidate with a Hansard deep link", () => {
    const raw: RawSpokenContribution = {
      MemberName: "Lizzi Collinge",
      MemberId: "5000",
      AttributedTo: "Lizzi Collinge (Morecambe and Lunesdale) (Lab)",
      ContributionExtId: "ABC-123",
      ContributionTextFull:
        'On a point of order, Madam Deputy Speaker. On 12 January, I misspoke <span data-column-number="693">and</span> mistakenly attributed comments.',
      ContributionText: null,
      DebateSection: "Point of Order",
      DebateSectionExtId: "DEB-1",
      SittingDate: "2026-01-15T00:00:00",
      House: "Commons",
    };
    const c = parsePointOfOrderCandidate(raw)!;
    expect(c.id).toBe("poo:ABC-123");
    expect(c.needsReview).toBe(true);
    expect(c.member).toMatchObject({ memberId: 5000, name: "Lizzi Collinge", party: "Lab" });
    expect(c.originalDate).toBe("2026-01-12");
    expect(c.daysToCorrect).toBe(3);
    expect(c.correctedText).not.toMatch(/data-column/);
    expect(c.correctionUrl).toBe(
      "https://hansard.parliament.uk/Commons/2026-01-15/debates/DEB-1/PointofOrder#contribution-ABC-123",
    );
  });

  it("skips the chair", () => {
    const raw = {
      MemberName: null,
      MemberId: null,
      AttributedTo: "Madam Deputy Speaker",
      ContributionExtId: "X",
      ContributionTextFull: "On a point of order. I would like to correct the record; I said the wrong date.",
      ContributionText: null,
      DebateSection: "Points of Order",
      DebateSectionExtId: "D",
      SittingDate: "2026-01-15T00:00:00",
      House: "Commons",
    };
    expect(parsePointOfOrderCandidate(raw)).toBeNull();
  });
});

describe("register statistics", () => {
  function entry(overrides: Partial<MinisterialCorrection>): MinisterialCorrection {
    return {
      ...parseWrittenQuestionCorrection(wq())!,
      ...overrides,
    };
  }

  it("medians", () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 10])).toBe(2.5);
  });

  it("excludes review-flagged candidates and groups by department and minister", () => {
    const stats = computeCorrectionsStats([
      entry({ id: "a", daysToCorrect: 2, department: "DHSC", member: { memberId: 1, name: "A", party: null, role: null } }),
      entry({ id: "b", daysToCorrect: 40, department: "DHSC", member: { memberId: 1, name: "A", party: null, role: null } }),
      entry({ id: "c", daysToCorrect: 10, department: "MoD", member: { memberId: 2, name: "B", party: null, role: null } }),
      entry({ id: "d", daysToCorrect: null, department: "MoD", member: { memberId: 2, name: "B", party: null, role: null } }),
      entry({ id: "e", daysToCorrect: 999, needsReview: true, kind: "oral-point-of-order" }),
    ]);
    expect(stats.total).toBe(4);
    expect(stats.needingReview).toBe(1);
    expect(stats.dated).toBe(3);
    expect(stats.medianDays).toBe(10);
    expect(stats.over30Days).toBeCloseTo(1 / 3);
    expect(stats.byDepartment).toEqual([
      { department: "DHSC", count: 2, medianDays: 21 },
      { department: "MoD", count: 2, medianDays: 10 },
    ]);
    expect(stats.byMinister.map((m) => [m.name, m.count])).toEqual([
      ["A", 2],
      ["B", 2],
    ]);
    expect(stats.medianDaysByKind["oral-point-of-order"]).toBeUndefined();
  });
});
