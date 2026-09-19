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

/* ── Built-in list prices (USD per 1M tokens) ─────────────────────────────
 * Until 2026-09-19 a service with no AI_PRICE_* vars metered every call at
 * $0, so its AI_BUDGET_* caps could never trip — the trader worker burned
 * the Anthropic balance that way. These are the fallback when neither a
 * per-model nor a per-provider env override is set. Env still wins. */
const BUILTIN_PRICES: Array<{
  provider: AIProviderId;
  match: RegExp;
  input: number;
  output: number;
}> = [
  { provider: "anthropic", match: /haiku/i, input: 1, output: 5 },
  { provider: "anthropic", match: /sonnet/i, input: 3, output: 15 },
  { provider: "anthropic", match: /opus/i, input: 5, output: 25 },
  { provider: "anthropic", match: /./, input: 3, output: 15 },
  { provider: "openai", match: /mini|nano/i, input: 0.15, output: 0.6 },
  { provider: "openai", match: /./, input: 2.5, output: 10 },
  { provider: "venice", match: /./, input: 0.2, output: 0.2 },
  { provider: "ollama", match: /./, input: 0, output: 0 },
];

function getBuiltinRate(
  provider: AIProviderId,
  model: string,
  direction: "INPUT" | "OUTPUT",
): number {
  const hit = BUILTIN_PRICES.find((p) => p.provider === provider && p.match.test(model));
  if (!hit) return 0;
  return direction === "INPUT" ? hit.input : hit.output;
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

  return getBuiltinRate(provider, model, direction);
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

/** True when any cap applies to this provider (its own or the global one). */
export function hasBudgetConfigured(provider: AIProviderId): boolean {
  return getProviderBudgetUsd(provider) !== null || getGlobalBudgetUsd() !== null;
}

/** Paid providers fail closed when the meter is unreachable unless this is set. */
export function budgetFailsOpen(): boolean {
  return readEnv("AI_BUDGET_FAIL_OPEN") === "true";
}
