import { describe, it, expect } from "vitest";
import { extractCanonicalClaim } from "../claim-extract";

describe("extractCanonicalClaim", () => {
  it("uses a strong seed claim as-is", () => {
    const claim = extractCanonicalClaim({
      seedClaim: "Federal court blocks emergency surveillance order.",
      title: "Ignored title",
    });

    expect(claim).toBe("Federal court blocks emergency surveillance order.");
  });

  it("normalizes title and strips source suffixes", () => {
    const claim = extractCanonicalClaim({
      title: "singapore workers brace for ai disruption - SCMP",
      description: "desc",
    });

    expect(claim).toBe("Singapore workers brace for ai disruption.");
  });

  it("falls back to description sentence when title is weak", () => {
    const claim = extractCanonicalClaim({
      title: "Live update",
      description:
        "Parliament approved the emergency spending bill after a late-night vote. Opposition leaders warned of inflation risks.",
    });

    expect(claim).toBe("Parliament approved the emergency spending bill after a late-night vote.");
  });

  it("falls back to URL slug when text fields are empty", () => {
    const claim = extractCanonicalClaim({
      title: "",
      description: "",
      url: "https://example.com/world/russia-launches-overnight-strike-in-kharkiv/",
    });

    expect(claim).toBe("Russia launches overnight strike kharkiv.");
  });

  it("returns claim unavailable when no input can be derived", () => {
    const claim = extractCanonicalClaim({
      title: "",
      description: "",
      url: "",
    });

    expect(claim).toBe("Claim unavailable.");
  });
});
