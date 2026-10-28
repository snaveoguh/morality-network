import { describe, expect, it } from "vitest";
import { isMpRoute, mpLaunchGate, mpRouteAccess } from "../launch-gate";

describe("MP Record launch gate", () => {
  it("hides the record in production until legal sign-off", () => {
    expect(mpLaunchGate({ NODE_ENV: "production" })).toEqual({ signedOff: null, visible: false });
  });

  it("shows it on staging with MP_RECORD_PREVIEW, still unsigned", () => {
    expect(mpLaunchGate({ NODE_ENV: "production", MP_RECORD_PREVIEW: "true" })).toEqual({ signedOff: null, visible: true });
  });

  it("shows it in development, unsigned", () => {
    expect(mpLaunchGate({ NODE_ENV: "development" }).visible).toBe(true);
  });

  it("publishes once a sign-off reference is configured", () => {
    expect(mpLaunchGate({ NODE_ENV: "production", MP_RECORD_LEGAL_SIGNOFF: " 2026-11-14 ref 1234 " })).toEqual({
      signedOff: "2026-11-14 ref 1234",
      visible: true,
    });
    expect(mpLaunchGate({ NODE_ENV: "production", MP_RECORD_LEGAL_SIGNOFF: "  " }).visible).toBe(false);
  });
});

describe("MP Record route access (middleware)", () => {
  const token = "a".repeat(32);
  const staging = { NODE_ENV: "production", MP_RECORD_PREVIEW: "true", MP_RECORD_PREVIEW_TOKEN: token };

  it("is open in development and once signed off", () => {
    expect(mpRouteAccess({ NODE_ENV: "development" }, {})).toBe("open");
    expect(mpRouteAccess({ NODE_ENV: "production", MP_RECORD_LEGAL_SIGNOFF: "ref" }, {})).toBe("open");
  });

  it("denies production without sign-off, even with a cookie", () => {
    expect(mpRouteAccess({ NODE_ENV: "production" }, { cookie: token })).toBe("deny");
  });

  it("fails closed when preview is on but no usable token is configured", () => {
    expect(mpRouteAccess({ NODE_ENV: "production", MP_RECORD_PREVIEW: "true" }, { param: "" })).toBe("deny");
    expect(mpRouteAccess({ ...staging, MP_RECORD_PREVIEW_TOKEN: "short" }, { param: "short" })).toBe("deny");
  });

  it("requires the token on staging", () => {
    expect(mpRouteAccess(staging, {})).toBe("deny");
    expect(mpRouteAccess(staging, { cookie: "a".repeat(31) })).toBe("deny");
    expect(mpRouteAccess(staging, { cookie: token + "a" })).toBe("deny");
    expect(mpRouteAccess(staging, { cookie: token })).toBe("preview");
    expect(mpRouteAccess(staging, { param: token })).toBe("grant-preview");
  });

  it("matches only MP routes", () => {
    expect(isMpRoute("/mp/4366")).toBe(true);
    expect(isMpRoute("/api/mp/4366/ties")).toBe(true);
    expect(isMpRoute("/mpx")).toBe(false);
    expect(isMpRoute("/api/mpesa")).toBe(false);
  });
});
