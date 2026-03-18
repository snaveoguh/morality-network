"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchScannerCandidates = fetchScannerCandidates;
function isAddress(value) {
    return typeof value === "string" && value.startsWith("0x") && value.length === 42;
}
function toDex(value) {
    if (typeof value !== "string")
        return null;
    const normalized = value.toLowerCase();
    if (normalized.includes("uniswap"))
        return "uniswap-v3";
    if (normalized.includes("aerodrome"))
        return "aerodrome";
    return null;
}
function normalizeLaunch(raw) {
    if (!raw || typeof raw !== "object")
        return null;
    const candidate = raw;
    const tokenAddressRaw = candidate.tokenAddress ??
        candidate.token ??
        candidate.baseTokenAddress ??
        candidate.address;
    if (!isAddress(tokenAddressRaw))
        return null;
    const dex = toDex(candidate.dex) ?? "uniswap-v3";
    const scoreRaw = Number(candidate.score ?? 0);
    const score = Number.isFinite(scoreRaw) ? scoreRaw : 0;
    const poolAddressRaw = candidate.poolAddress;
    const poolAddress = isAddress(poolAddressRaw) ? poolAddressRaw : undefined;
    return {
        tokenAddress: tokenAddressRaw,
        poolAddress,
        dex,
        score,
        scoreBreakdown: candidate.scoreBreakdown && typeof candidate.scoreBreakdown === "object"
            ? candidate.scoreBreakdown
            : undefined,
        pairedAsset: typeof candidate.pairedAsset === "string" ? candidate.pairedAsset : undefined,
        tokenMeta: candidate.tokenMeta && typeof candidate.tokenMeta === "object"
            ? candidate.tokenMeta
            : undefined,
        dexScreenerData: candidate.dexScreenerData && typeof candidate.dexScreenerData === "object"
            ? candidate.dexScreenerData
            : undefined,
    };
}
function extractItems(payload) {
    if (Array.isArray(payload))
        return payload;
    if (!payload || typeof payload !== "object")
        return [];
    const envelope = payload;
    if (Array.isArray(envelope.messages)) {
        return envelope.messages.map((message) => message?.payload);
    }
    return envelope.launches ?? envelope.data ?? envelope.items ?? envelope.tokens ?? [];
}
function getIndexerEventApiUrl() {
    const base = process.env.INDEXER_BACKEND_URL?.trim() ||
        process.env.ARCHIVE_BACKEND_URL?.trim() ||
        process.env.SCANNER_BACKEND_URL?.trim() ||
        "";
    if (!base)
        return null;
    return `${base.replace(/\/$/, "")}/api/v1/agents/events`;
}
async function fetchEventCandidates(config, signal) {
    const eventApiUrl = getIndexerEventApiUrl();
    if (!eventApiUrl)
        return [];
    const requestUrl = new URL(eventApiUrl);
    requestUrl.searchParams.set("limit", String(Math.max(10, config.risk.maxNewEntriesPerCycle * 4)));
    requestUrl.searchParams.set("topic", "trade-candidate");
    requestUrl.searchParams.set("since", String(Date.now() - 6 * 60 * 60 * 1000));
    const res = await fetch(requestUrl.toString(), {
        method: "GET",
        cache: "no-store",
        signal,
    });
    if (!res.ok) {
        throw new Error(`event API ${res.status}`);
    }
    const payload = await res.json();
    const items = extractItems(payload);
    return items.map(normalizeLaunch).filter((launch) => launch !== null);
}
function dedupeLaunches(launches) {
    const byToken = new Map();
    for (const launch of launches) {
        const key = launch.tokenAddress.toLowerCase();
        const existing = byToken.get(key);
        if (!existing || launch.score > existing.score) {
            byToken.set(key, launch);
        }
    }
    return Array.from(byToken.values()).sort((a, b) => b.score - a.score);
}
async function fetchScannerCandidates(config) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.scannerRequestTimeoutMs);
    try {
        const requestUrl = new URL(config.scannerApiUrl);
        if (!requestUrl.searchParams.has("minScore")) {
            requestUrl.searchParams.set("minScore", String(config.risk.minScore));
        }
        if (!requestUrl.searchParams.has("limit")) {
            requestUrl.searchParams.set("limit", String(Math.max(5, config.risk.maxNewEntriesPerCycle * 3)));
        }
        const [scannerRes, eventCandidates] = await Promise.all([
            fetch(requestUrl.toString(), {
                method: "GET",
                cache: "no-store",
                signal: controller.signal,
            }),
            fetchEventCandidates(config, controller.signal).catch(() => []),
        ]);
        if (!scannerRes.ok) {
            throw new Error(`scanner API ${scannerRes.status}`);
        }
        const payload = await scannerRes.json();
        const items = extractItems(payload);
        const normalized = items.map(normalizeLaunch).filter((launch) => launch !== null);
        return dedupeLaunches([...normalized, ...eventCandidates]).filter((launch) => launch.score >= config.risk.minScore);
    }
    finally {
        clearTimeout(timer);
    }
}
