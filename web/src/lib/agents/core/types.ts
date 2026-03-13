// ─── Agent Core — Types ────────────────────────────────────────────────────

/** Agent lifecycle states */
export type AgentStatus = "idle" | "starting" | "running" | "stopping" | "error";

/** Every agent must implement this interface */
export interface Agent {
  /** Unique identifier (kebab-case, e.g. "launch-scanner") */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** Short description */
  readonly description: string;
  /** Current status */
  status(): AgentStatus;
  /** Start the agent's polling/watching loop */
  start(): void;
  /** Stop the agent gracefully */
  stop(): void;
  /** Return serializable state snapshot (for API consumption) */
  snapshot(): AgentSnapshot;
}

/** Serializable agent status for API responses */
export interface AgentSnapshot {
  id: string;
  name: string;
  description: string;
  status: AgentStatus;
  startedAt: number | null;
  lastActivityAt: number | null;
  stats: Record<string, number>;
  errors: string[];
}

export interface AgentMessageSender {
  address?: string | null;
  ens?: string | null;
}

export interface AgentMessageMeta {
  sender?: AgentMessageSender;
  humanPrompt?: boolean;
  promptText?: string | null;
  promptPreview?: string | null;
  relayedFrom?: string | null;
  receivedAt?: number;
  bridge?: {
    present?: boolean;
    verified?: boolean;
    trusted?: boolean;
    signer?: string | null;
    claimedSigner?: string | null;
    signature?: string | null;
    origin?: string | null;
    audience?: string | null;
    relayTimestampMs?: number | null;
    relayAgeMs?: number | null;
    version?: string | null;
    reason?: string | null;
  };
}

/** Inter-agent message */
export interface AgentMessage<T = unknown> {
  id: string;
  from: string;
  to: string | "*";
  topic: string;
  payload: T;
  timestamp: number;
  meta?: AgentMessageMeta;
  /** Set by bridge relay to prevent infinite loops */
  _bridged?: boolean;
}

/** Handler for incoming messages */
export type MessageHandler<T = unknown> = (message: AgentMessage<T>) => void | Promise<void>;
