// ============================================================================
// BANKR AGENT API CLIENT
//
// Wraps the Bankr Agent API (api.bankr.bot) for trade execution.
// Users provide their own API key — trades execute in their Bankr wallet.
// We never store keys server-side; they're passed per-request.
//
// Docs: https://docs.bankr.bot/agent-api/overview
// ============================================================================

const BANKR_API_BASE = "https://api.bankr.bot";
const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_ATTEMPTS = 60; // ~2 minutes max

// ── Types ───────────────────────────────────────────────────────────────────

export type BankrJobStatus =
  | "pending"
  | "processing"
  | "completed"
  | "failed"
  | "cancelled";

export interface BankrPromptResponse {
  jobId: string;
  threadId: string;
  status: BankrJobStatus;
}

export interface BankrJobResponse {
  jobId: string;
  status: BankrJobStatus;
  response?: string;
  richData?: Array<{ type: string; data: unknown }>;
  createdAt?: string;
  completedAt?: string;
  error?: string;
}

export interface BankrTradeResult {
  success: boolean;
  jobId: string;
  status: BankrJobStatus;
  response?: string;
  error?: string;
}

// ── API Client ──────────────────────────────────────────────────────────────

/**
 * Submit a natural language prompt to the Bankr Agent API.
 * The prompt is executed against the user's Bankr wallet.
 *
 * @example
 *   const job = await submitPrompt(apiKey, "open a 40x long on BTC worth $50 on hyperliquid");
 */
export async function submitPrompt(
  apiKey: string,
  prompt: string,
  threadId?: string,
): Promise<BankrPromptResponse> {
  const body: Record<string, string> = { prompt };
  if (threadId) body.threadId = threadId;

  const res = await fetch(`${BANKR_API_BASE}/agent/prompt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 401) throw new Error("Invalid Bankr API key");
    if (res.status === 402) throw new Error("Bankr account requires prepaid credits — fund via https://docs.openclaw.dev");
    if (res.status === 429) throw new Error("Bankr rate limit exceeded — check your plan credits at https://docs.openclaw.dev");
    throw new Error(`Bankr API ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

/**
 * Poll a Bankr job for its current status and response.
 */
export async function pollJob(
  apiKey: string,
  jobId: string,
): Promise<BankrJobResponse> {
  const res = await fetch(`${BANKR_API_BASE}/agent/job/${jobId}`, {
    headers: { "X-API-Key": apiKey },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bankr job poll ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

/**
 * Cancel a pending/processing Bankr job.
 */
export async function cancelJob(
  apiKey: string,
  jobId: string,
): Promise<void> {
  const res = await fetch(`${BANKR_API_BASE}/agent/job/${jobId}/cancel`, {
    method: "POST",
    headers: { "X-API-Key": apiKey },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bankr cancel ${res.status}: ${text.slice(0, 200)}`);
  }
}

/**
 * Submit a prompt and poll until completion or failure.
 * Yields status updates as they happen.
 *
 * @example
 *   for await (const update of executeAndStream(apiKey, "long BTC 40x $50")) {
 *     console.log(update.status, update.response);
 *   }
 */
export async function* executeAndStream(
  apiKey: string,
  prompt: string,
  threadId?: string,
  signal?: AbortSignal,
): AsyncGenerator<BankrJobResponse> {
  const job = await submitPrompt(apiKey, prompt, threadId);

  yield {
    jobId: job.jobId,
    status: "pending",
  };

  let attempts = 0;

  while (attempts < MAX_POLL_ATTEMPTS) {
    if (signal?.aborted) {
      // Try to cancel the job on abort
      await cancelJob(apiKey, job.jobId).catch(() => {});
      yield {
        jobId: job.jobId,
        status: "cancelled",
        response: "Trade cancelled by user",
      };
      return;
    }

    await sleep(POLL_INTERVAL_MS);
    attempts++;

    const status = await pollJob(apiKey, job.jobId);
    yield status;

    if (
      status.status === "completed" ||
      status.status === "failed" ||
      status.status === "cancelled"
    ) {
      return;
    }
  }

  // Timed out
  yield {
    jobId: job.jobId,
    status: "failed",
    error: "Trade timed out after 2 minutes",
  };
}

/**
 * Simple execute-and-wait (no streaming). Returns final result.
 */
export async function executeAndWait(
  apiKey: string,
  prompt: string,
  threadId?: string,
): Promise<BankrTradeResult> {
  let lastResponse: BankrJobResponse | undefined;

  for await (const update of executeAndStream(apiKey, prompt, threadId)) {
    lastResponse = update;
  }

  if (!lastResponse) {
    return { success: false, jobId: "", status: "failed", error: "No response" };
  }

  return {
    success: lastResponse.status === "completed",
    jobId: lastResponse.jobId,
    status: lastResponse.status,
    response: lastResponse.response,
    error: lastResponse.error,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Validate a Bankr API key format (basic check).
 */
export function isValidBankrKey(key: string): boolean {
  return typeof key === "string" && key.length > 10 && key.trim() === key;
}

/**
 * Mask a Bankr API key for display: "bnkr_abc...xyz"
 */
export function maskBankrKey(key: string): string {
  if (key.length <= 8) return "***";
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}
