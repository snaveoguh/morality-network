import type { AIProviderId } from "./ai-models";

const DEFAULT_WINDOW_HOURS = 24;

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function readNumberEnv(name: string): number | null {
  const value = readEnv(name);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getModelEnvSuffix(model: string): string {
  return model
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function getProviderEnvPrefix(provider: AIProviderId): string {
  return provider.toUpperCase();
}

function getRateUsdPerMillion(
  provider: AIProviderId,
  model: string,
  direction: "INPUT" | "OUTPUT",
): number {
  const providerPrefix = getProviderEnvPrefix(provider);
  const modelSuffix = getModelEnvSuffix(model);
  const modelRate = readNumberEnv(
    `AI_PRICE_${providerPrefix}_${modelSuffix}_${direction}_USD_PER_1M`,
  );
  if (modelRate !== null) {
    return Math.max(0, modelRate);
  }

  const providerRate = readNumberEnv(`AI_PRICE_${providerPrefix}_${direction}_USD_PER_1M`);
  if (providerRate !== null) {
    return Math.max(0, providerRate);
  }

  return 0;
}

export function estimateAIInvocationCostMicrousd(args: {
  provider: AIProviderId;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): number {
  const inputRate = getRateUsdPerMillion(args.provider, args.model, "INPUT");
  const outputRate = getRateUsdPerMillion(args.provider, args.model, "OUTPUT");
  const inputCostMicrousd = args.inputTokens * inputRate;
  const outputCostMicrousd = args.outputTokens * outputRate;
  return Math.max(0, Math.round(inputCostMicrousd + outputCostMicrousd));
}

export function getAIBudgetWindowHours(): number {
  const parsed = readNumberEnv("AI_BUDGET_WINDOW_HOURS");
  if (parsed === null) return DEFAULT_WINDOW_HOURS;
  return Math.max(1, Math.min(24 * 30, Math.floor(parsed)));
}

export function getGlobalBudgetUsd(): number | null {
  const parsed = readNumberEnv("AI_BUDGET_TOTAL_USD");
  return parsed === null ? null : Math.max(0, parsed);
}

export function getProviderBudgetUsd(provider: AIProviderId): number | null {
  const parsed = readNumberEnv(`AI_BUDGET_${getProviderEnvPrefix(provider)}_USD`);
  return parsed === null ? null : Math.max(0, parsed);
}

