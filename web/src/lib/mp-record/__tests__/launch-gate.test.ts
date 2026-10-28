import { describe, expect, it } from "vitest";
import { mpLaunchGate } from "../launch-gate";

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
