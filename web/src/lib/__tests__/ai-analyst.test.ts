import { afterEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
  vi.resetModules();
});

// ai-models reads its env at module load, so each case re-imports it.
async function loadModels(env: Record<string, string>) {
  vi.resetModules();
  Object.assign(process.env, env);
  return import("../ai-models");
}

describe("analyst provider (own open-weight models)", () => {
  it("is off by default: no task routes to it", async () => {
    const models = await loadModels({ ANALYST_BASE_URL: "http://analyst.test/v1" });
    expect(models.AI_MODEL_POLICY.tradingPatternDetection.providers).not.toContain("analyst");
    expect(models.AI_MODEL_POLICY.pmAnalysis.providers).not.toContain("analyst");
    expect(models.analystHandlesTask("tradingPatternDetection")).toBe(false);
  });

  it("goes first only for the tasks of enabled analysts", async () => {
    const models = await loadModels({
      ANALYST_BASE_URL: "http://analyst.test/v1/",
      ANALYST_ENABLED: "ta",
    });
    const ta = models.AI_MODEL_POLICY.tradingPatternDetection;
    expect(ta.providers[0]).toBe("analyst");
    expect(ta.models.analyst).toBe("pooter-ta");
    expect(models.AI_MODEL_POLICY.claimLedgerExtraction.providers).not.toContain("analyst");
    expect(models.getAnalystBaseUrl("tradingPatternDetection")).toBe("http://analyst.test/v1");
    expect(models.getConfiguredProvidersForTask("tradingPatternDetection")).toContain("analyst");
  });

  it("prefers a per-analyst endpoint over the shared one", async () => {
    const models = await loadModels({
      ANALYST_PM_BASE_URL: "http://pm.test/v1",
      ANALYST_ENABLED: "pm,person",
    });
    expect(models.getAnalystBaseUrl("claimLedgerResolution")).toBe("http://pm.test/v1");
    // person is enabled but has no endpoint of its own and no shared one
    expect(models.analystHandlesTask("personAnalysis")).toBe(false);
    expect(models.analystHandlesTask("pmAnalysis")).toBe(true);
  });

  it("obeys the AI_DISABLED_PROVIDERS kill switch", async () => {
    const models = await loadModels({
      ANALYST_BASE_URL: "http://analyst.test/v1",
      ANALYST_ENABLED: "ta,supply,pm,person",
      AI_DISABLED_PROVIDERS: "analyst",
    });
    expect(models.analystHandlesTask("supplyChainAnalysis")).toBe(false);
    expect(models.getConfiguredProvidersForTask("supplyChainAnalysis")).not.toContain("analyst");
  });

  it("never meters at $0 without a price override", async () => {
    const { estimateAIInvocationCostMicrousd } = await import("../ai-budget");
    const cost = estimateAIInvocationCostMicrousd({
      provider: "analyst",
      model: "pooter-pm",
      inputTokens: 1_000_000,
      outputTokens: 0,
    });
    expect(cost).toBeGreaterThan(0);
    process.env.AI_PRICE_ANALYST_INPUT_USD_PER_1M = "0";
    expect(
      estimateAIInvocationCostMicrousd({
        provider: "analyst",
        model: "pooter-pm",
        inputTokens: 1_000_000,
        outputTokens: 0,
      }),
    ).toBe(0);
  });

  it("skips the Agent Hub and calls the analyst endpoint when enabled", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(String(url));
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "<think>hmm</think>trend: up" } }],
            usage: { prompt_tokens: 10, completion_tokens: 3 },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }),
    );
    Object.assign(process.env, {
      AGENT_HUB_URL: "http://hub.test",
      ANALYST_BASE_URL: "http://analyst.test/v1",
      ANALYST_ENABLED: "ta",
    });
    delete process.env.INDEXER_BACKEND_URL;
    vi.resetModules();
    const { generateTextForTask } = await import("../ai-provider");
    const result = await generateTextForTask({
      task: "tradingPatternDetection",
      user: "BTC 15m snapshot",
      maxTokens: 50,
    });
    expect(result.provider).toBe("analyst");
    expect(result.model).toBe("pooter-ta");
    expect(result.text).toBe("trend: up");
    expect(calls[0]).toBe("http://analyst.test/v1/chat/completions");
    expect(calls.some((url) => url.startsWith("http://hub.test"))).toBe(false);
  });
});
