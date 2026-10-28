import "server-only";

export type AIProviderId = "anthropic" | "openai" | "venice" | "ollama" | "analyst";
/** Our own open-weight specialist models (docs/own-models-plan.md). */
export type AnalystId = "ta" | "supply" | "pm" | "person";
const ANALYST_IDS: readonly AnalystId[] = ["ta", "supply", "pm", "person"];
export type AIModelTask =
  | "editorialWriter"
  | "editorialExtractor"
  | "dailyEditionWriter"
  | "dailyEditionExtractor"
  | "biasDigest"
  | "entityScoring"
  | "sentimentScoring"
  | "factExtraction"
  | "claimLedgerExtraction"
  | "claimLedgerResolution"
  | "selfLearn"
  | "moralCompass"
  | "tradingPatternDetection"
  | "webIntelligence"
  | "councilDeliberation"
  | "technicalAnalysis"
  | "supplyChainAnalysis"
  | "pmAnalysis"
  | "personAnalysis";

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

/** Kill switch: AI_DISABLED_PROVIDERS=anthropic,openai removes providers
 * from every task without touching their keys. */
const DISABLED_PROVIDERS = new Set(
  (readEnv("AI_DISABLED_PROVIDERS") ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0),
);

export function isProviderConfigured(provider: AIProviderId): boolean {
  if (DISABLED_PROVIDERS.has(provider)) return false;
  if (provider === "analyst") {
    return (
      Boolean(readEnv("ANALYST_BASE_URL")) ||
      ANALYST_IDS.some((id) => Boolean(readEnv(`ANALYST_${id.toUpperCase()}_BASE_URL`)))
    );
  }
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

const FAST_MODELS: Omit<Record<AIProviderId, string>, "analyst"> = {
  anthropic: readModelEnv("ANTHROPIC_FAST_MODEL", "claude-haiku-4-5"),
  openai: readModelEnv("OPENAI_FAST_MODEL", "gpt-5-mini"),
  venice: readModelEnv("VENICE_FAST_MODEL", "qwen3-4b"),
  ollama: readModelEnv("OLLAMA_FAST_MODEL", "qwen2.5:7b-instruct"),
};

const PREMIUM_MODELS: Omit<Record<AIProviderId, string>, "analyst"> = {
  anthropic: readModelEnv("ANTHROPIC_PREMIUM_MODEL", "claude-sonnet-4-6"),
  openai: readModelEnv("OPENAI_PREMIUM_MODEL", "gpt-5"),
  venice: readModelEnv("VENICE_PREMIUM_MODEL", "llama-3.3-70b"),
  ollama: readModelEnv("OLLAMA_PREMIUM_MODEL", "qwen2.5:14b-instruct"),
};

/* ── Analysts: our own open-weight models (docs/own-models-plan.md) ──────
 * Each analyst is a model name on an OpenAI-compatible endpoint
 * (ANALYST_BASE_URL, or ANALYST_<ID>_BASE_URL per analyst). OFF by default:
 * an analyst joins a task only when it is listed in ANALYST_ENABLED
 * (e.g. ANALYST_ENABLED=ta,pm) and the endpoint is set. It then goes first
 * for its tasks, ahead of the Agent Hub, and the usual providers stay
 * behind it as fallback. AI_DISABLED_PROVIDERS=analyst turns them all off. */
const ANALYST_MODELS: Record<AnalystId, string> = {
  ta: readModelEnv("ANALYST_TA_MODEL", "pooter-ta"),
  supply: readModelEnv("ANALYST_SUPPLY_MODEL", "pooter-supply"),
  pm: readModelEnv("ANALYST_PM_MODEL", "pooter-pm"),
  person: readModelEnv("ANALYST_PERSON_MODEL", "pooter-person"),
};

const TASK_ANALYST: Partial<Record<AIModelTask, AnalystId>> = {
  technicalAnalysis: "ta",
  tradingPatternDetection: "ta",
  supplyChainAnalysis: "supply",
  pmAnalysis: "pm",
  claimLedgerExtraction: "pm",
  claimLedgerResolution: "pm",
  personAnalysis: "person",
  entityScoring: "person",
};

const ENABLED_ANALYSTS = new Set(
  (readEnv("ANALYST_ENABLED") ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry): entry is AnalystId => (ANALYST_IDS as readonly string[]).includes(entry)),
);

export function getAnalystForTask(task: AIModelTask): AnalystId | null {
  const analyst = TASK_ANALYST[task];
  return analyst && ENABLED_ANALYSTS.has(analyst) ? analyst : null;
}

/** True when an enabled, configured analyst should answer this task. */
export function analystHandlesTask(task: AIModelTask): boolean {
  return !DISABLED_PROVIDERS.has("analyst") && getAnalystBaseUrl(task) !== null;
}

export function getAnalystBaseUrl(task: AIModelTask): string | null {
  const analyst = getAnalystForTask(task);
  if (!analyst) return null;
  const url = readEnv(`ANALYST_${analyst.toUpperCase()}_BASE_URL`) ?? readEnv("ANALYST_BASE_URL");
  return url ? url.replace(/\/$/, "") : null;
}

function withAnalyst(
  task: AIModelTask,
  providers: AIProviderId[],
  models: Omit<Record<AIProviderId, string>, "analyst">,
): AIProviderTaskPolicy {
  const analyst = getAnalystForTask(task);
  return {
    providers: analyst ? ["analyst", ...providers] : providers,
    models: { ...models, analyst: analyst ? ANALYST_MODELS[analyst] : "" },
  };
}

const BASE_POLICY: Record<AIModelTask, { providers: AIProviderId[]; models: Omit<Record<AIProviderId, string>, "analyst"> }> = {
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
  // Claim Ledger: extraction quality > cost (spec §Risks). Premium order —
  // published claims carry the model stamp, so quality is auditable per model.
  claimLedgerExtraction: {
    providers: PREMIUM_PROVIDER_ORDER,
    models: PREMIUM_MODELS,
  },
  // Verdict proposals go to a human review queue, but a sloppy proposal
  // wastes reviewer time — same premium bar as extraction.
  claimLedgerResolution: {
    providers: PREMIUM_PROVIDER_ORDER,
    models: PREMIUM_MODELS,
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
  councilDeliberation: {
    providers: FAST_PROVIDER_ORDER,
    models: FAST_MODELS,
  },
  // Analyst tasks: no call sites yet. Without an enabled analyst they use
  // the ordinary providers (fast for TA, premium for the research jobs).
  technicalAnalysis: {
    providers: FAST_PROVIDER_ORDER,
    models: FAST_MODELS,
  },
  supplyChainAnalysis: {
    providers: PREMIUM_PROVIDER_ORDER,
    models: PREMIUM_MODELS,
  },
  pmAnalysis: {
    providers: PREMIUM_PROVIDER_ORDER,
    models: PREMIUM_MODELS,
  },
  personAnalysis: {
    providers: PREMIUM_PROVIDER_ORDER,
    models: PREMIUM_MODELS,
  },
};

export const AI_MODEL_POLICY = Object.fromEntries(
  (Object.keys(BASE_POLICY) as AIModelTask[]).map((task) => [
    task,
    withAnalyst(task, BASE_POLICY[task].providers, BASE_POLICY[task].models),
  ]),
) as Record<AIModelTask, AIProviderTaskPolicy>;

export function getConfiguredProvidersForTask(task: AIModelTask): AIProviderId[] {
  return AI_MODEL_POLICY[task].providers.filter((provider) => isProviderConfigured(provider));
}

export function hasAIProviderForTask(task: AIModelTask): boolean {
  return getConfiguredProvidersForTask(task).length > 0;
}
