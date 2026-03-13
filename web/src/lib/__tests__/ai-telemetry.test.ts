import { afterEach, describe, expect, it } from "vitest";
import {
  estimateAIInvocationCostMicrousd,
  getAIBudgetWindowHours,
} from "../ai-budget";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("ai-telemetry", () => {
  it("estimates provider-level token cost in microusd", () => {
    process.env.AI_PRICE_OPENAI_INPUT_USD_PER_1M = "0.25";
    process.env.AI_PRICE_OPENAI_OUTPUT_USD_PER_1M = "2";

    const cost = estimateAIInvocationCostMicrousd({
      provider: "openai",
      model: "gpt-5",
      inputTokens: 1000,
      outputTokens: 500,
    });

    expect(cost).toBe(1250);
  });

  it("prefers model-specific pricing overrides", () => {
    process.env.AI_PRICE_OLLAMA_INPUT_USD_PER_1M = "1";
    process.env.AI_PRICE_OLLAMA_QWEN2_5_14B_INSTRUCT_INPUT_USD_PER_1M = "3";

    const cost = estimateAIInvocationCostMicrousd({
      provider: "ollama",
      model: "qwen2.5:14b-instruct",
      inputTokens: 100,
      outputTokens: 0,
    });

    expect(cost).toBe(300);
  });

  it("uses a sane default budget window", () => {
    delete process.env.AI_BUDGET_WINDOW_HOURS;
    expect(getAIBudgetWindowHours()).toBe(24);

    process.env.AI_BUDGET_WINDOW_HOURS = "12";
    expect(getAIBudgetWindowHours()).toBe(12);
  });
});
