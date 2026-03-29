import "server-only";

/**
 * ai-router.ts — Universal LLM provider router with auto-failover.
 *
 * Every provider is OpenAI-compatible. Adding a new provider = drop in an API key.
 * The router tries free providers first, paid last. If a provider fails (429/5xx),
 * it's marked unhealthy for 5 minutes and skipped.
 *
 * Usage:
 *   const result = await routerGenerate({ tier: "fast", system: "...", user: "...", maxTokens: 512 });
 */

// ============================================================================
// PROVIDER DEFINITIONS
// ============================================================================

export interface AIProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKeyEnvVar: string;
  models: { fast: string; premium: string };
  /** Custom headers builder. Default: Bearer token in Authorization */
  headers?: (apiKey: string) => Record<string, string>;
  free: boolean;
  /** Whether this provider uses the native Anthropic/OpenAI SDK (not OpenAI-compatible) */
  native?: "anthropic" | "openai";
}

/**
 * All known providers. Order matters — free providers first, paid last.
 * Only providers with a configured API key will be active.
 */
const PROVIDER_REGISTRY: AIProviderConfig[] = [
  // ── Free tier providers (try these first) ──
  {
    id: "gemini",
    name: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    apiKeyEnvVar: "GEMINI_API_KEY",
    models: { fast: "gemini-2.5-flash", premium: "gemini-2.5-pro" },
    free: true,
  },
  {
    id: "cerebras",
    name: "Cerebras",
    baseUrl: "https://api.cerebras.ai/v1/",
    apiKeyEnvVar: "CEREBRAS_API_KEY",
    models: { fast: "llama-3.3-70b", premium: "llama-3.3-70b" },
    free: true,
  },
  {
    id: "groq",
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1/",
    apiKeyEnvVar: "GROQ_API_KEY",
    models: { fast: "llama-3.3-70b-versatile", premium: "llama-3.3-70b-versatile" },
    free: true,
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1/",
    apiKeyEnvVar: "OPENROUTER_API_KEY",
    models: { fast: "meta-llama/llama-3.3-70b-instruct:free", premium: "meta-llama/llama-3.3-70b-instruct:free" },
    free: true,
  },
  {
    id: "venice",
    name: "Venice AI",
    baseUrl: process.env.VENICE_BASE_URL || "https://api.venice.ai/api/v1/",
    apiKeyEnvVar: "VENICE_API_KEY",
    models: {
      fast: process.env.VENICE_FAST_MODEL || "llama-3.3-70b",
      premium: process.env.VENICE_PREMIUM_MODEL || "llama-3.3-70b",
    },
    free: false, // Venice has a paid tier but is cheap
  },
  {
    id: "bankr",
    name: "Bankr LLM",
    baseUrl: "https://llm.bankr.bot/v1/",
    apiKeyEnvVar: "BANKR_API_KEY",
    models: {
      fast: process.env.BANKR_LLM_MODEL || "claude-sonnet-4-20250514",
      premium: process.env.BANKR_LLM_MODEL || "claude-sonnet-4-20250514",
    },
    headers: (key) => ({
      Authorization: `Bearer ${key}`,
      "X-API-Key": key,
    }),
    free: false,
  },
  {
    id: "ollama",
    name: "Ollama (Local)",
    baseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1/",
    apiKeyEnvVar: "OLLAMA_BASE_URL", // presence of URL = configured
    models: {
      fast: process.env.OLLAMA_FAST_MODEL || "qwen2.5:7b-instruct",
      premium: process.env.OLLAMA_PREMIUM_MODEL || "qwen2.5:14b-instruct",
    },
    headers: () => ({}), // No auth for local
    free: true,
  },
  // ── Paid providers (last resort) ──
  {
    id: "anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com/",
    apiKeyEnvVar: "ANTHROPIC_API_KEY",
    models: {
      fast: process.env.ANTHROPIC_FAST_MODEL || "claude-haiku-4-20250414",
      premium: process.env.ANTHROPIC_PREMIUM_MODEL || "claude-sonnet-4-20250514",
    },
    native: "anthropic",
    free: false,
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1/",
    apiKeyEnvVar: "OPENAI_API_KEY",
    models: {
      fast: process.env.OPENAI_FAST_MODEL || "gpt-4o-mini",
      premium: process.env.OPENAI_PREMIUM_MODEL || "gpt-4o",
    },
    native: "openai",
    free: false,
  },
];

// ============================================================================
// HEALTH TRACKING
// ============================================================================

interface ProviderHealth {
  healthy: boolean;
  lastFailure: number;
  failureCount: number;
  totalRequests: number;
  totalTokens: number;
  lastUsed: number;
}

const HEALTH_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
const healthMap = new Map<string, ProviderHealth>();

function getHealth(id: string): ProviderHealth {
  if (!healthMap.has(id)) {
    healthMap.set(id, {
      healthy: true,
      lastFailure: 0,
      failureCount: 0,
      totalRequests: 0,
      totalTokens: 0,
      lastUsed: 0,
    });
  }
  return healthMap.get(id)!;
}

function markHealthy(id: string, tokens: number) {
  const h = getHealth(id);
  h.healthy = true;
  h.totalRequests++;
  h.totalTokens += tokens;
  h.lastUsed = Date.now();
}

function markUnhealthy(id: string) {
  const h = getHealth(id);
  h.healthy = false;
  h.lastFailure = Date.now();
  h.failureCount++;
  h.totalRequests++;
}

function isHealthy(id: string): boolean {
  const h = getHealth(id);
  if (h.healthy) return true;
  // Recovery: if cooldown has passed, try again
  if (Date.now() - h.lastFailure > HEALTH_COOLDOWN_MS) {
    h.healthy = true;
    return true;
  }
  return false;
}

// ============================================================================
// ACTIVE PROVIDERS — only those with configured API keys
// ============================================================================

function getApiKey(provider: AIProviderConfig): string | null {
  const val = process.env[provider.apiKeyEnvVar]?.trim();
  // Special case: Ollama just needs the URL to be set
  if (provider.id === "ollama" && val) return "ollama";
  return val && val.length > 0 ? val : null;
}

let _activeProviders: AIProviderConfig[] | null = null;

export function getActiveProviders(): AIProviderConfig[] {
  if (_activeProviders) return _activeProviders;
  _activeProviders = PROVIDER_REGISTRY.filter((p) => getApiKey(p) !== null);
  return _activeProviders;
}

/** Reset cached providers (useful if env vars change at runtime) */
export function resetProviderCache(): void {
  _activeProviders = null;
}

// ============================================================================
// ROUTER — generate text with auto-failover
// ============================================================================

export type ModelTier = "fast" | "premium";

export interface RouterRequest {
  tier: ModelTier;
  system?: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  timeoutMs?: number;
  /** Prefer specific provider (will try this first if healthy) */
  preferProvider?: string;
  /** Max providers to try before giving up */
  maxAttempts?: number;
}

export interface RouterResult {
  provider: string;
  model: string;
  text: string;
  tokens: { input: number; output: number; total: number };
}

/**
 * Generate text using the best available provider.
 * Tries free providers first, falls back to paid, auto-skips unhealthy.
 */
export async function routerGenerate(req: RouterRequest): Promise<RouterResult> {
  const providers = getActiveProviders();
  if (providers.length === 0) {
    throw new Error("No AI providers configured. Set at least one API key (GEMINI_API_KEY, GROQ_API_KEY, etc.)");
  }

  const maxAttempts = req.maxAttempts ?? providers.length;
  const errors: string[] = [];

  // Build ordered list: preferred provider first, then free, then paid
  let ordered = [...providers];
  if (req.preferProvider) {
    const preferred = ordered.find((p) => p.id === req.preferProvider);
    if (preferred) {
      ordered = [preferred, ...ordered.filter((p) => p.id !== req.preferProvider)];
    }
  }

  for (let i = 0; i < Math.min(maxAttempts, ordered.length); i++) {
    const provider = ordered[i];
    if (!isHealthy(provider.id)) {
      errors.push(`${provider.id}: unhealthy (cooldown)`);
      continue;
    }

    const apiKey = getApiKey(provider);
    if (!apiKey) continue;

    const model = provider.models[req.tier];

    try {
      const result = await callOpenAICompatible(provider, apiKey, model, req);
      markHealthy(provider.id, result.tokens.total);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${provider.id}: ${msg}`);
      markUnhealthy(provider.id);
    }
  }

  throw new Error(`All providers failed:\n${errors.join("\n")}`);
}

// ============================================================================
// OpenAI-COMPATIBLE CALL — works for all providers except native Anthropic/OpenAI
// ============================================================================

async function callOpenAICompatible(
  provider: AIProviderConfig,
  apiKey: string,
  model: string,
  req: RouterRequest,
): Promise<RouterResult> {
  // For native providers, delegate to their specific handlers
  if (provider.native === "anthropic") {
    return callAnthropicNative(apiKey, model, req);
  }
  if (provider.native === "openai") {
    return callOpenAINative(provider, apiKey, model, req);
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(provider.headers
      ? provider.headers(apiKey)
      : { Authorization: `Bearer ${apiKey}` }),
  };

  const messages: Array<{ role: string; content: string }> = [];
  if (req.system) messages.push({ role: "system", content: req.system });
  messages.push({ role: "user", content: req.user });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), req.timeoutMs ?? 30_000);

  try {
    const res = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages,
        max_tokens: req.maxTokens,
        temperature: req.temperature ?? 0.3,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    };

    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text) throw new Error("Empty response from provider");

    return {
      provider: provider.id,
      model,
      text,
      tokens: {
        input: data.usage?.prompt_tokens ?? 0,
        output: data.usage?.completion_tokens ?? 0,
        total: data.usage?.total_tokens ?? 0,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================================
// NATIVE ANTHROPIC — uses Messages API directly (not OpenAI-compatible)
// ============================================================================

async function callAnthropicNative(
  apiKey: string,
  model: string,
  req: RouterRequest,
): Promise<RouterResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), req.timeoutMs ?? 30_000);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: req.maxTokens,
        ...(req.system ? { system: req.system } : {}),
        messages: [{ role: "user", content: req.user }],
        temperature: req.temperature ?? 0.3,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Anthropic ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      content?: Array<{ text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    const text = data.content?.[0]?.text ?? "";
    if (!text) throw new Error("Empty response from Anthropic");

    return {
      provider: "anthropic",
      model,
      text,
      tokens: {
        input: data.usage?.input_tokens ?? 0,
        output: data.usage?.output_tokens ?? 0,
        total: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================================
// NATIVE OPENAI — uses OpenAI chat completions endpoint
// ============================================================================

async function callOpenAINative(
  provider: AIProviderConfig,
  apiKey: string,
  model: string,
  req: RouterRequest,
): Promise<RouterResult> {
  // OpenAI IS OpenAI-compatible, so just call the generic handler with native flag removed
  const nonNativeProvider = { ...provider, native: undefined };
  return callOpenAICompatible(nonNativeProvider, apiKey, model, req);
}

// ============================================================================
// STATUS — provider health + usage for monitoring
// ============================================================================

export interface ProviderStatus {
  id: string;
  name: string;
  configured: boolean;
  healthy: boolean;
  free: boolean;
  models: { fast: string; premium: string };
  stats: {
    totalRequests: number;
    totalTokens: number;
    failureCount: number;
    lastUsed: number | null;
  };
}

export function getProviderStatuses(): ProviderStatus[] {
  return PROVIDER_REGISTRY.map((p) => {
    const configured = getApiKey(p) !== null;
    const h = getHealth(p.id);
    return {
      id: p.id,
      name: p.name,
      configured,
      healthy: configured ? isHealthy(p.id) : false,
      free: p.free,
      models: p.models,
      stats: {
        totalRequests: h.totalRequests,
        totalTokens: h.totalTokens,
        failureCount: h.failureCount,
        lastUsed: h.lastUsed || null,
      },
    };
  });
}
