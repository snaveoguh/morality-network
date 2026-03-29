import "server-only";

export type AIProviderId = "anthropic" | "openai" | "venice" | "ollama";
export type AIModelTask =
  | "editorialWriter"
  | "editorialExtractor"
  | "dailyEditionWriter"
  | "dailyEditionExtractor"
  | "biasDigest"
  | "entityScoring"
  | "sentimentScoring"
  | "factExtraction"
  | "selfLearn"
  | "moralCompass"
  | "tradingPatternDetection"
  | "webIntelligence";

export interface AIProviderTaskPolicy {
  providers: AIProviderId[];
  models: Record<AIProviderId, string>;
}

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

function readModelEnv(name: string, fallback: string): string {
  return readEnv(name) ?? fallback;
}

function parseProviderOrder(value: string | null, fallback: AIProviderId[]): AIProviderId[] {
  if (!value) return fallback;

  const parsed = value
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry): entry is AIProviderId =>
      entry === "anthropic" || entry === "openai" || entry === "venice" || entry === "ollama",
    );

  return parsed.length > 0 ? Array.from(new Set(parsed)) : fallback;
}

export function isProviderConfigured(provider: AIProviderId): boolean {
  if (provider === "anthropic") {
    return Boolean(readEnv("ANTHROPIC_API_KEY"));
  }
  if (provider === "openai") {
    return Boolean(readEnv("OPENAI_API_KEY"));
  }
  if (provider === "venice") {
    return Boolean(readEnv("VENICE_API_KEY"));
  }
  return Boolean(readEnv("OLLAMA_BASE_URL")) || readEnv("OLLAMA_ENABLED") === "true";
}

const FAST_PROVIDER_ORDER = parseProviderOrder(
  readEnv("AI_FAST_PROVIDER_ORDER"),
  ["ollama", "venice", "openai", "anthropic"],
);

// Default: try cheap providers first, fall back to Anthropic.
// Override with AI_PREMIUM_PROVIDER_ORDER=anthropic,venice,ollama to prioritise quality.
const PREMIUM_PROVIDER_ORDER = parseProviderOrder(
  readEnv("AI_PREMIUM_PROVIDER_ORDER"),
  ["venice", "ollama", "openai", "anthropic"],
);

const FAST_MODELS: Record<AIProviderId, string> = {
  anthropic: readModelEnv("ANTHROPIC_FAST_MODEL", "claude-haiku-4-20250414"),
  openai: readModelEnv("OPENAI_FAST_MODEL", "gpt-5-mini"),
  venice: readModelEnv("VENICE_FAST_MODEL", "qwen3-4b"),
  ollama: readModelEnv("OLLAMA_FAST_MODEL", "qwen2.5:7b-instruct"),
};

const PREMIUM_MODELS: Record<AIProviderId, string> = {
  anthropic: readModelEnv("ANTHROPIC_PREMIUM_MODEL", "claude-sonnet-4-20250514"),
  openai: readModelEnv("OPENAI_PREMIUM_MODEL", "gpt-5"),
  venice: readModelEnv("VENICE_PREMIUM_MODEL", "llama-3.3-70b"),
  ollama: readModelEnv("OLLAMA_PREMIUM_MODEL", "qwen2.5:14b-instruct"),
};

export const AI_MODEL_POLICY: Record<AIModelTask, AIProviderTaskPolicy> = {
  editorialWriter: {
    providers: PREMIUM_PROVIDER_ORDER,
    models: PREMIUM_MODELS,
  },
  editorialExtractor: {
    providers: FAST_PROVIDER_ORDER,
    models: FAST_MODELS,
  },
  dailyEditionWriter: {
    providers: PREMIUM_PROVIDER_ORDER,
    models: PREMIUM_MODELS,
  },
  dailyEditionExtractor: {
    providers: FAST_PROVIDER_ORDER,
    models: FAST_MODELS,
  },
  biasDigest: {
    providers: FAST_PROVIDER_ORDER,
    models: FAST_MODELS,
  },
  entityScoring: {
    providers: FAST_PROVIDER_ORDER,
    models: FAST_MODELS,
  },
  sentimentScoring: {
    providers: FAST_PROVIDER_ORDER,
    models: FAST_MODELS,
  },
  factExtraction: {
    providers: FAST_PROVIDER_ORDER,
    models: FAST_MODELS,
  },
  selfLearn: {
    providers: FAST_PROVIDER_ORDER,
    models: FAST_MODELS,
  },
  moralCompass: {
    providers: PREMIUM_PROVIDER_ORDER,
    models: PREMIUM_MODELS,
  },
  tradingPatternDetection: {
    providers: FAST_PROVIDER_ORDER,
    models: FAST_MODELS,
  },
  webIntelligence: {
    providers: FAST_PROVIDER_ORDER,
    models: FAST_MODELS,
  },
};

export function getConfiguredProvidersForTask(task: AIModelTask): AIProviderId[] {
  return AI_MODEL_POLICY[task].providers.filter((provider) => isProviderConfigured(provider));
}

export function hasAIProviderForTask(task: AIModelTask): boolean {
  return getConfiguredProvidersForTask(task).length > 0;
}
