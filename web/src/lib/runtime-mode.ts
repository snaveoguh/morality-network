export type AgentRuntimeMode = "request" | "worker";
export type TraderExecutionMode = "request" | "worker";

function normalizeMode<TMode extends "request" | "worker">(
  value: string | undefined,
  fallback: TMode,
): TMode {
  const normalized = value?.trim().toLowerCase();
  return normalized === "worker" ? ("worker" as TMode) : fallback;
}

export function getAgentRuntimeMode(): AgentRuntimeMode {
  return normalizeMode(process.env.AGENT_RUNTIME_MODE, "request");
}

export function isWorkerAgentRuntime(): boolean {
  return getAgentRuntimeMode() === "worker";
}

export function getTraderExecutionMode(): TraderExecutionMode {
  return normalizeMode(process.env.TRADER_EXECUTION_MODE, "request");
}

export function isWorkerTraderRuntime(): boolean {
  return getTraderExecutionMode() === "worker";
}
