"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAgentRuntimeMode = getAgentRuntimeMode;
exports.isWorkerAgentRuntime = isWorkerAgentRuntime;
exports.getTraderExecutionMode = getTraderExecutionMode;
exports.isWorkerTraderRuntime = isWorkerTraderRuntime;
function normalizeMode(value, fallback) {
    const normalized = value?.trim().toLowerCase();
    return normalized === "worker" ? "worker" : fallback;
}
function getAgentRuntimeMode() {
    return normalizeMode(process.env.AGENT_RUNTIME_MODE, "request");
}
function isWorkerAgentRuntime() {
    return getAgentRuntimeMode() === "worker";
}
function getTraderExecutionMode() {
    return normalizeMode(process.env.TRADER_EXECUTION_MODE, "request");
}
function isWorkerTraderRuntime() {
    return getTraderExecutionMode() === "worker";
}
