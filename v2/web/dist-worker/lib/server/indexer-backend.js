"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIndexerBackendUrl = getIndexerBackendUrl;
exports.hasIndexerBackend = hasIndexerBackend;
exports.fetchIndexerJson = fetchIndexerJson;
require("server-only");
const DEFAULT_TIMEOUT_MS = 10_000;
function firstDefined(...values) {
    for (const value of values) {
        const trimmed = value?.trim();
        if (trimmed)
            return trimmed;
    }
    return null;
}
function getIndexerBackendUrl() {
    const url = firstDefined(process.env.INDEXER_BACKEND_URL, process.env.ARCHIVE_BACKEND_URL, process.env.SCANNER_BACKEND_URL);
    return url ? url.replace(/\/$/, "") : null;
}
function hasIndexerBackend() {
    return getIndexerBackendUrl() !== null;
}
async function fetchIndexerJson(path, init = undefined) {
    const baseUrl = getIndexerBackendUrl();
    if (!baseUrl) {
        throw new Error("Indexer backend URL is not configured");
    }
    const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const url = new URL(path, `${baseUrl}/`);
    const response = await fetch(url.toString(), {
        ...init,
        cache: init?.cache ?? "no-store",
        signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Indexer ${response.status}${body ? `: ${body.slice(0, 240)}` : ""}`);
    }
    return (await response.json());
}
