import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// @ts-expect-error Vitest supports virtual module mocks at runtime.
vi.mock("server-only", () => ({}), { virtual: true });

const ORIGINAL_ENV = { ...process.env };

describe("message bus persistence", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    process.env = {
      ...ORIGINAL_ENV,
      INDEXER_BACKEND_URL: "https://indexer.example.com",
    };
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    global.fetch = originalFetch;
    process.env = { ...ORIGINAL_ENV };
  });

  it("batches local messages into a single durable event write", async () => {
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          ok: true,
          count: body.messages.length,
          messages: body.messages,
        }),
        { status: 200 },
      );
    });
    global.fetch = fetchSpy as typeof fetch;

    const { messageBus } = await import("../agents/core/bus");

    await messageBus.publish({
      id: "msg-1",
      from: "scanner",
      to: "*",
      topic: "new-token-launch",
      payload: { tokenAddress: "0x1" },
      timestamp: 1_700_000_000_000,
    });
    await messageBus.publish({
      id: "msg-2",
      from: "coordinator",
      to: "*",
      topic: "trade-candidate",
      payload: { tokenAddress: "0x2" },
      timestamp: 1_700_000_001_000,
    });

    await vi.advanceTimersByTimeAsync(300);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(String(url)).toBe("https://indexer.example.com/api/v1/agents/events");
    expect(init?.method).toBe("POST");

    const body = JSON.parse(String(init?.body));
    expect(body.source).toBe("request-runtime");
    expect(body.messages).toHaveLength(2);
    expect(body.messages.map((message: { id: string }) => message.id)).toEqual([
      "msg-1",
      "msg-2",
    ]);
  });

  it("keeps bridged messages under a separate durable source", async () => {
    const fetchSpy = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      return new Response(
        JSON.stringify({
          ok: true,
          count: body.messages.length,
          messages: body.messages,
        }),
        { status: 200 },
      );
    });
    global.fetch = fetchSpy as typeof fetch;

    const { messageBus } = await import("../agents/core/bus");

    await messageBus.publish({
      id: "local-1",
      from: "coordinator",
      to: "*",
      topic: "trade-candidate",
      payload: { tokenAddress: "0x3" },
      timestamp: 1_700_000_002_000,
    });
    await messageBus.publish({
      id: "bridge-1",
      from: "nounirl",
      to: "*",
      topic: "emerging-event",
      payload: { clusterId: "abc" },
      timestamp: 1_700_000_003_000,
      _bridged: true,
    });

    await vi.advanceTimersByTimeAsync(300);

    expect(fetchSpy).toHaveBeenCalledTimes(2);

    const sources = fetchSpy.mock.calls.map(([, init]) => {
      const body = JSON.parse(String(init?.body));
      return body.source;
    });

    expect(sources).toEqual(["request-runtime", "bridge-relay"]);
  });
});
