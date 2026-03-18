"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateTextForTask = generateTextForTask;
require("server-only");
const ai_models_1 = require("./ai-models");
const ai_telemetry_1 = require("./server/ai-telemetry");
const ai_budget_1 = require("./ai-budget");
function readEnv(name) {
    const value = process.env[name]?.trim();
    return value && value.length > 0 ? value : null;
}
function getProviderModel(task, provider) {
    return ai_models_1.AI_MODEL_POLICY[task].models[provider];
}
function getOpenAICompatibleBaseUrl(provider) {
    if (provider === "openai") {
        return (readEnv("OPENAI_BASE_URL") || "https://api.openai.com/v1").replace(/\/$/, "");
    }
    if (provider === "venice") {
        return (readEnv("VENICE_BASE_URL") || "https://api.venice.ai/api/v1").replace(/\/$/, "");
    }
    return (readEnv("OLLAMA_BASE_URL") || "http://127.0.0.1:11434/v1").replace(/\/$/, "");
}
function getProviderApiKey(provider) {
    if (provider === "openai")
        return readEnv("OPENAI_API_KEY");
    if (provider === "venice")
        return readEnv("VENICE_API_KEY");
    return readEnv("OLLAMA_API_KEY");
}
function coerceMessageContent(value) {
    if (typeof value === "string")
        return value;
    if (Array.isArray(value)) {
        return value
            .map((entry) => {
            if (typeof entry === "string")
                return entry;
            if (!entry || typeof entry !== "object")
                return "";
            const block = entry;
            if (typeof block.text === "string")
                return block.text;
            return "";
        })
            .filter((entry) => entry.length > 0)
            .join("\n\n");
    }
    return "";
}
async function generateAnthropicText(task, request) {
    const apiKey = readEnv("ANTHROPIC_API_KEY");
    if (!apiKey) {
        throw new Error("ANTHROPIC_API_KEY is not configured");
    }
    const model = getProviderModel(task, "anthropic");
    const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
            model,
            max_tokens: request.maxTokens,
            temperature: request.temperature ?? 0,
            system: request.system,
            messages: [{ role: "user", content: request.user }],
        }),
        signal: AbortSignal.timeout(request.timeoutMs ?? 30_000),
    });
    if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`anthropic ${response.status}${body ? `: ${body.slice(0, 240)}` : ""}`);
    }
    const payload = (await response.json());
    const text = Array.isArray(payload.content)
        ? payload.content
            .filter((block) => block?.type === "text" && typeof block.text === "string")
            .map((block) => block.text || "")
            .join("\n\n")
            .trim()
        : "";
    if (!text) {
        throw new Error("anthropic returned no text");
    }
    const inputTokens = Math.max(0, Number(payload.usage?.input_tokens ?? 0));
    const outputTokens = Math.max(0, Number(payload.usage?.output_tokens ?? 0));
    return {
        provider: "anthropic",
        model,
        text,
        usage: {
            inputTokens,
            outputTokens,
            totalTokens: Math.max(0, inputTokens + outputTokens),
        },
        meta: {
            responseId: payload.id ?? null,
            stopReason: payload.stop_reason ?? null,
            cacheCreationInputTokens: payload.usage?.cache_creation_input_tokens ?? 0,
            cacheReadInputTokens: payload.usage?.cache_read_input_tokens ?? 0,
        },
    };
}
async function generateOpenAICompatibleText(provider, task, request) {
    const model = getProviderModel(task, provider);
    const apiKey = getProviderApiKey(provider);
    const headers = {
        "content-type": "application/json",
    };
    if (apiKey) {
        headers.authorization = `Bearer ${apiKey}`;
    }
    const response = await fetch(`${getOpenAICompatibleBaseUrl(provider)}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
            model,
            max_tokens: request.maxTokens,
            temperature: request.temperature ?? 0,
            stream: false,
            messages: [
                ...(request.system ? [{ role: "system", content: request.system }] : []),
                { role: "user", content: request.user },
            ],
        }),
        signal: AbortSignal.timeout(request.timeoutMs ?? 30_000),
    });
    if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`${provider} ${response.status}${body ? `: ${body.slice(0, 240)}` : ""}`);
    }
    const payload = (await response.json());
    const text = coerceMessageContent(payload.choices?.[0]?.message?.content).trim();
    if (!text) {
        throw new Error(`${provider} returned no text`);
    }
    const inputTokens = Math.max(0, Number(payload.usage?.prompt_tokens ?? payload.usage?.prompt_eval_count ?? 0));
    const outputTokens = Math.max(0, Number(payload.usage?.completion_tokens ?? payload.usage?.eval_count ?? 0));
    const totalTokens = Math.max(0, Number(payload.usage?.total_tokens ?? inputTokens + outputTokens));
    return {
        provider,
        model,
        text,
        usage: {
            inputTokens,
            outputTokens,
            totalTokens,
        },
        meta: {
            responseId: payload.id ?? null,
        },
    };
}
async function recordAIUsageSafely(input) {
    try {
        await (0, ai_telemetry_1.recordAIUsage)(input);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[ai-provider] failed to persist AI usage: ${message}`);
    }
}
async function generateTextForTask(request) {
    const providers = (0, ai_models_1.getConfiguredProvidersForTask)(request.task);
    if (providers.length === 0) {
        throw new Error(`No AI providers configured for task "${request.task}"`);
    }
    let lastError = null;
    for (const [index, provider] of providers.entries()) {
        const budgetState = await (0, ai_telemetry_1.getAIProviderBudgetState)(provider, request.task).catch((error) => {
            console.warn(`[ai-provider] budget check failed for ${provider}/${request.task}: ${error instanceof Error ? error.message : String(error)}`);
            return null;
        });
        if (budgetState && !budgetState.allowed) {
            const model = getProviderModel(request.task, provider);
            const reason = budgetState.providerExceeded
                ? `${provider} budget exhausted for ${budgetState.windowHours}h window`
                : `global AI budget exhausted for ${budgetState.windowHours}h window`;
            await recordAIUsageSafely({
                task: request.task,
                provider,
                model,
                status: "budget-blocked",
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                latencyMs: 0,
                estimatedCostMicrousd: 0,
                error: reason,
                meta: {
                    attempt: index + 1,
                    totalProviders: providers.length,
                    maxTokens: request.maxTokens,
                    temperature: request.temperature ?? 0,
                    budgetState,
                },
            });
            lastError = new Error(reason);
            console.warn(`[ai-provider] ${provider} skipped for ${request.task}: ${reason}`);
            continue;
        }
        const startedAt = Date.now();
        try {
            let result;
            if (provider === "anthropic") {
                result = await generateAnthropicText(request.task, request);
            }
            else {
                result = await generateOpenAICompatibleText(provider, request.task, request);
            }
            const latencyMs = Math.max(0, Date.now() - startedAt);
            await recordAIUsageSafely({
                task: request.task,
                provider: result.provider,
                model: result.model,
                status: "success",
                inputTokens: result.usage.inputTokens,
                outputTokens: result.usage.outputTokens,
                totalTokens: result.usage.totalTokens,
                latencyMs,
                estimatedCostMicrousd: (0, ai_budget_1.estimateAIInvocationCostMicrousd)({
                    provider: result.provider,
                    model: result.model,
                    inputTokens: result.usage.inputTokens,
                    outputTokens: result.usage.outputTokens,
                }),
                meta: {
                    attempt: index + 1,
                    totalProviders: providers.length,
                    maxTokens: request.maxTokens,
                    temperature: request.temperature ?? 0,
                    systemChars: request.system?.length ?? 0,
                    userChars: request.user.length,
                    providerMeta: result.meta ?? null,
                },
            });
            return { provider: result.provider, model: result.model, text: result.text };
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            const latencyMs = Math.max(0, Date.now() - startedAt);
            const model = getProviderModel(request.task, provider);
            await recordAIUsageSafely({
                task: request.task,
                provider,
                model,
                status: "error",
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0,
                latencyMs,
                estimatedCostMicrousd: 0,
                error: lastError.message,
                meta: {
                    attempt: index + 1,
                    totalProviders: providers.length,
                    maxTokens: request.maxTokens,
                    temperature: request.temperature ?? 0,
                    systemChars: request.system?.length ?? 0,
                    userChars: request.user.length,
                },
            });
            console.warn(`[ai-provider] ${provider} failed for ${request.task}: ${lastError.message}`);
        }
    }
    throw lastError ?? new Error(`All AI providers failed for task "${request.task}"`);
}
