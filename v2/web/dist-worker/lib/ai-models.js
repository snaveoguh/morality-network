"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AI_MODEL_POLICY = void 0;
exports.isProviderConfigured = isProviderConfigured;
exports.getConfiguredProvidersForTask = getConfiguredProvidersForTask;
exports.hasAIProviderForTask = hasAIProviderForTask;
require("server-only");
function readEnv(name) {
    const value = process.env[name]?.trim();
    return value && value.length > 0 ? value : null;
}
function readModelEnv(name, fallback) {
    return readEnv(name) ?? fallback;
}
function parseProviderOrder(value, fallback) {
    if (!value)
        return fallback;
    const parsed = value
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter((entry) => entry === "anthropic" || entry === "openai" || entry === "venice" || entry === "ollama");
    return parsed.length > 0 ? Array.from(new Set(parsed)) : fallback;
}
function isProviderConfigured(provider) {
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
const FAST_PROVIDER_ORDER = parseProviderOrder(readEnv("AI_FAST_PROVIDER_ORDER"), ["ollama", "venice", "openai", "anthropic"]);
// Default: try cheap providers first, fall back to Anthropic.
// Override with AI_PREMIUM_PROVIDER_ORDER=anthropic,venice,ollama to prioritise quality.
const PREMIUM_PROVIDER_ORDER = parseProviderOrder(readEnv("AI_PREMIUM_PROVIDER_ORDER"), ["venice", "ollama", "openai", "anthropic"]);
const FAST_MODELS = {
    anthropic: readModelEnv("ANTHROPIC_FAST_MODEL", "claude-haiku-4-20250414"),
    openai: readModelEnv("OPENAI_FAST_MODEL", "gpt-5-mini"),
    venice: readModelEnv("VENICE_FAST_MODEL", "qwen3-4b"),
    ollama: readModelEnv("OLLAMA_FAST_MODEL", "qwen2.5:7b-instruct"),
};
const PREMIUM_MODELS = {
    anthropic: readModelEnv("ANTHROPIC_PREMIUM_MODEL", "claude-sonnet-4-20250514"),
    openai: readModelEnv("OPENAI_PREMIUM_MODEL", "gpt-5"),
    venice: readModelEnv("VENICE_PREMIUM_MODEL", "llama-3.3-70b"),
    ollama: readModelEnv("OLLAMA_PREMIUM_MODEL", "qwen2.5:14b-instruct"),
};
exports.AI_MODEL_POLICY = {
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
};
function getConfiguredProvidersForTask(task) {
    return exports.AI_MODEL_POLICY[task].providers.filter((provider) => isProviderConfigured(provider));
}
function hasAIProviderForTask(task) {
    return getConfiguredProvidersForTask(task).length > 0;
}
