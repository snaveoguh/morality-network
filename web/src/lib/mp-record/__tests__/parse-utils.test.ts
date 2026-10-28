import { describe, expect, it } from "vitest";
import { canonicalJson, contentHash } from "../hash";
import {
  formatGbp,
  moneyToDecimal,
  normaliseName,
  parseBool,
  parseCsv,
  parseMoneyToPence,
  parseRegisterDate,
  penceToDecimal,
} from "../parse-utils";

describe("money", () => {
  it("parses stated amounts to exact pence", () => {
    expect(parseMoneyToPence("5950.00")).toBe(595000);
    expect(parseMoneyToPence("£23,858.89")).toBe(2385889);
    expect(parseMoneyToPence("5950")).toBe(595000);
    expect(parseMoneyToPence("0.5")).toBe(50);
    expect(parseMoneyToPence("-12.30")).toBe(-1230);
    expect(parseMoneyToPence(1840)).toBe(184000);
  });

  it("refuses ambiguous or malformed amounts rather than guessing", () => {
    expect(parseMoneyToPence("")).toBeNull();
    expect(parseMoneyToPence(null)).toBeNull();
    expect(parseMoneyToPence("12.345")).toBeNull();
    expect(parseMoneyToPence("about £500")).toBeNull();
    expect(parseMoneyToPence("1.2e3")).toBeNull();
    expect(parseMoneyToPence(Number.NaN)).toBeNull();
  });

  it("round-trips without float drift", () => {
    // 0.1 + 0.2 style traps: sum in pence, format once.
    const pence = ["0.10", "0.20", "1999999.99"].map((v) => parseMoneyToPence(v)!).reduce((a, b) => a + b, 0);
    expect(penceToDecimal(pence)).toBe("2000000.29");
    expect(formatGbp(pence)).toBe("£2,000,000.29");
    expect(moneyToDecimal("£1,000")).toBe("1000.00");
    expect(penceToDecimal(-5)).toBe("-0.05");
  });
});

describe("dates", () => {
  it("normalises every register date format to YYYY-MM-DD", () => {
    expect(parseRegisterDate("2024-07-04T00:00:00")).toBe("2024-07-04");
    expect(parseRegisterDate("2024-07-04")).toBe("2024-07-04");
    expect(parseRegisterDate("29/01/2026")).toBe("2026-01-29"); // UK day-first
    expect(parseRegisterDate("/Date(1769644800000)/")).toBe("2026-01-29");
  });

  it("rejects impossible or unknown dates", () => {
    expect(parseRegisterDate("31/02/2026")).toBeNull();
    expect(parseRegisterDate("2026-13-01")).toBeNull();
    expect(parseRegisterDate("01/29/2026")).toBeNull(); // US order is not accepted
    expect(parseRegisterDate("")).toBeNull();
    expect(parseRegisterDate(null)).toBeNull();
  });

  it("parses EC booleans strictly", () => {
    expect(parseBool("True")).toBe(true);
    expect(parseBool("False")).toBe(false);
    expect(parseBool("")).toBeNull();
    expect(parseBool("yes")).toBeNull();
  });
});

describe("parseCsv", () => {
  it("handles BOM, quoted commas, doubled quotes, embedded newlines and CRLF", () => {
    const text = '﻿A,B,C\r\n1,"£1,000.00","say ""hi"""\r\n2,"line\nbreak",\r\n';
    expect(parseCsv(text)).toEqual([
      { A: "1", B: "£1,000.00", C: 'say "hi"' },
      { A: "2", B: "line\nbreak", C: "" },
    ]);
  });

  it("throws on truncated input instead of returning partial rows", () => {
    expect(() => parseCsv('A,B\n1,"unterminated')).toThrow(/unterminated/);
    expect(() => parseCsv("A,B\n1,2,3\n")).toThrow(/3 fields/);
  });

  it("returns no rows for header-only or empty input", () => {
    expect(parseCsv("A,B\n")).toEqual([]);
    expect(parseCsv("")).toEqual([]);
  });
});

describe("normaliseName", () => {
  it("strips honorifics, post-nominals, accents and punctuation", () => {
    expect(normaliseName("Rt Hon Sir James Cleverly MP")).toBe("james cleverly");
    expect(normaliseName("James Cleverly MP")).toBe("james cleverly");
    expect(normaliseName("Dame Siobhain McDonagh")).toBe("siobhain mcdonagh");
    expect(normaliseName("Dr Rosena Allin-Khan")).toBe("rosena allin khan");
    expect(normaliseName("Zoë  Franklin")).toBe("zoe franklin");
  });
});

describe("content hash", () => {
  it("is independent of key order and sensitive to content", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, 1], c: null } })).toBe('{"a":{"c":null,"d":[2,1]},"b":1}');
    expect(contentHash({ a: 1, b: "x" })).toBe(contentHash({ b: "x", a: 1 }));
    expect(contentHash({ a: 1, b: "x" })).not.toBe(contentHash({ a: 1, b: "y" }));
    expect(contentHash({ a: 1, u: undefined })).toBe(contentHash({ a: 1 }));
    expect(contentHash({ v: "5950.00" })).not.toBe(contentHash({ v: "5950.0" }));
  });

  it("rejects values that cannot hash deterministically", () => {
    expect(() => canonicalJson({ a: Number.POSITIVE_INFINITY })).toThrow();
  });
});
