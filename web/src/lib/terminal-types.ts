// ============================================================================
// TERMINAL TYPES — shared between server (terminal-llm.ts) and client
// No server-only guard — these are pure type definitions.
// ============================================================================

export interface TerminalTradingContext {
  executionVenue: string;
  dryRun: boolean;
  feePct: number;
  fundingAddress: string;
  canWithdraw: boolean;
  // Totals
  openPositions: number;
  closedPositions: number;
  grossPnlUsd: number;
  netPnlUsd: number;
  unrealizedPnlUsd: number;
  realizedPnlUsd: number;
  deployedUsd: number;
  // Open position details
  positions: Array<{
    symbol: string;
    entryPrice: number;
    currentPrice: number | null;
    unrealizedPnl: number | null;
    size: number;
  }>;
  // Vault state (if applicable)
  vault?: {
    aumUsd: number;
    liquidUsd: number;
    deployedUsd: number;
    totalFunders: number;
    feePct: number;
  };
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}
