/**
 * governance/index.ts — Governance Watcher Agent
 *
 * Monitors onchain governance proposals across major protocols (Compound, Aave,
 * Uniswap, ENS, Arbitrum, Optimism) via the Tally API and publishes alpha
 * signals to the message bus when tradeable events are detected.
 *
 * Signal logic:
 *   - New proposal created in a major protocol → mild signal
 *   - Proposal vote shifts (passing → failing or vice versa) → strong signal
 *   - Proposal executed (treasury spend, protocol upgrade) → directional signal
 *   - Treasury spends → short governance token (supply dilution)
 *   - Protocol upgrades / fee changes → long (ecosystem improvement)
 */

import { randomUUID } from "node:crypto";
import type { Agent, AgentSnapshot, AgentStatus } from "../core/types";
import { messageBus } from "../core/bus";
import { agentRegistry } from "../core/registry";
import type {
  GovernanceProposal,
  GovernanceAlphaSignal,
  GovernanceProtocolConfig,
} from "./types";
import { GOVERNANCE_PROTOCOLS } from "./types";
import { fetchAllProtocolProposals } from "./protocols";

/* ═══════════════════════════  Config  ═══════════════════════════ */

const POLL_INTERVAL_MS = parseInt(
  process.env.GOVERNANCE_POLL_INTERVAL_MS ?? String(5 * 60_000),
  10,
);

/** Keywords that suggest treasury spending (bearish for token) */
const TREASURY_KEYWORDS = [
  "treasury", "grant", "funding", "budget", "spending", "transfer",
  "compensation", "pay", "salary", "reward", "bounty", "allocation",
];

/** Keywords that suggest protocol improvement (bullish for token) */
const UPGRADE_KEYWORDS = [
  "upgrade", "improvement", "v2", "v3", "v4", "migration", "optimization",
  "fee", "revenue", "buyback", "burn", "staking", "security", "audit",
];

/* ═══════════════════════════  Agent  ═══════════════════════════ */

class GovernanceWatcherAgent implements Agent {
  readonly id = "governance-watcher";
  readonly name = "Governance Watcher";
  readonly description = "Monitors onchain governance for tradeable events across major protocols";

  private _status: AgentStatus = "idle";
  private startedAt: number | null = null;
  private lastActivityAt: number | null = null;
  private errors: string[] = [];
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  /** Track seen proposals to detect status changes */
  private proposalCache = new Map<string, GovernanceProposal>();
  private signalsEmitted = 0;
  private proposalsSeen = 0;
  private lastPollAt = 0;

  private protocols: GovernanceProtocolConfig[] = GOVERNANCE_PROTOCOLS;

  status(): AgentStatus {
    return this._status;
  }

  start(): void {
    if (this._status === "running") return;
    this._status = "starting";
    this.startedAt = Date.now();

    // Initial poll after 10 seconds
    setTimeout(() => {
      void this.poll();
    }, 10_000);

    // Recurring poll
    this.pollTimer = setInterval(() => {
      void this.poll();
    }, POLL_INTERVAL_MS);

    this._status = "running";
    console.log(`[governance-watcher] Started, polling every ${POLL_INTERVAL_MS / 1000}s for ${this.protocols.length} protocols`);
  }

  stop(): void {
    this._status = "stopping";
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this._status = "idle";
    console.log("[governance-watcher] Stopped");
  }

  snapshot(): AgentSnapshot {
    const now = Date.now();
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      status: this._status,
      startedAt: this.startedAt,
      lastActivityAt: this.lastActivityAt,
      stats: {
        proposalsSeen: this.proposalsSeen,
        signalsEmitted: this.signalsEmitted,
        cachedProposals: this.proposalCache.size,
        lastPollAt: this.lastPollAt,
        pollIntervalMs: POLL_INTERVAL_MS,
        protocols: this.protocols.length,
        uptimeSeconds: this.startedAt ? Math.floor((now - this.startedAt) / 1000) : 0,
      },
      errors: this.errors.slice(-5),
    };
  }

  /* ═══════════════  Polling  ═══════════════ */

  private async poll(): Promise<void> {
    try {
      this.lastPollAt = Date.now();
      const proposals = await fetchAllProtocolProposals(this.protocols);
      this.proposalsSeen += proposals.length;

      for (const proposal of proposals) {
        const cached = this.proposalCache.get(proposal.id);

        if (!cached) {
          // New proposal — check if it's active and worth signaling
          this.proposalCache.set(proposal.id, proposal);
          if (proposal.status === "active") {
            const signal = this.analyzeProposal(proposal, "proposal-created");
            if (signal) {
              await this.emitSignal(signal);
            }
          }
        } else {
          // Existing proposal — check for status changes or vote shifts
          const statusChanged = cached.status !== proposal.status;
          const voteShifted = this.detectVoteShift(cached, proposal);

          this.proposalCache.set(proposal.id, proposal);

          if (statusChanged) {
            let eventType: GovernanceAlphaSignal["eventType"] = "proposal-created";
            if (proposal.status === "executed") eventType = "proposal-executed";
            else if (proposal.status === "succeeded") eventType = "proposal-passing";
            else if (proposal.status === "defeated") eventType = "proposal-failing";

            const signal = this.analyzeProposal(proposal, eventType);
            if (signal) {
              await this.emitSignal(signal);
            }
          } else if (voteShifted) {
            const signal = this.analyzeProposal(proposal, "large-vote-shift");
            if (signal) {
              await this.emitSignal(signal);
            }
          }
        }
      }

      this.lastActivityAt = Date.now();

      // Prune old proposals (keep last 500)
      if (this.proposalCache.size > 500) {
        const entries = Array.from(this.proposalCache.entries())
          .sort((a, b) => b[1].updatedAt - a[1].updatedAt);
        this.proposalCache = new Map(entries.slice(0, 500));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.errors.push(msg);
      if (this.errors.length > 20) this.errors = this.errors.slice(-20);
      console.warn("[governance-watcher] Poll failed:", msg);
    }
  }

  /* ═══════════════  Analysis  ═══════════════ */

  /**
   * Detect significant vote shifts between cached and new proposal state.
   * A "shift" is when the for/against ratio changes significantly.
   */
  private detectVoteShift(cached: GovernanceProposal, current: GovernanceProposal): boolean {
    const cachedTotal = cached.forVotes + cached.againstVotes;
    const currentTotal = current.forVotes + current.againstVotes;

    // Need meaningful vote totals
    if (cachedTotal < 10 || currentTotal < 10) return false;

    const cachedForPct = cached.forVotes / cachedTotal;
    const currentForPct = current.forVotes / currentTotal;

    // >10 percentage point shift
    return Math.abs(currentForPct - cachedForPct) > 0.10;
  }

  /**
   * Analyze a proposal and determine if it produces a tradeable signal.
   * Returns null if no actionable signal.
   */
  private analyzeProposal(
    proposal: GovernanceProposal,
    eventType: GovernanceAlphaSignal["eventType"],
  ): GovernanceAlphaSignal | null {
    const protocol = this.protocols.find((p) => p.id === proposal.protocol);
    if (!protocol) return null;

    const titleLower = proposal.title.toLowerCase();
    const descLower = proposal.description.toLowerCase();
    const combinedText = `${titleLower} ${descLower}`;

    // Classify proposal type
    const isTreasurySpend = TREASURY_KEYWORDS.some((kw) => combinedText.includes(kw));
    const isUpgrade = UPGRADE_KEYWORDS.some((kw) => combinedText.includes(kw));

    let direction: "long" | "short";
    let confidence: number;
    let reasoning: string;

    switch (eventType) {
      case "proposal-created": {
        // New proposals have mild impact
        if (isTreasurySpend) {
          direction = "short";
          confidence = 0.3;
          reasoning = `New treasury spend proposal in ${protocol.name}: "${proposal.title}"`;
        } else if (isUpgrade) {
          direction = "long";
          confidence = 0.3;
          reasoning = `New protocol upgrade proposal in ${protocol.name}: "${proposal.title}"`;
        } else {
          // Unclear impact — skip
          return null;
        }
        break;
      }

      case "proposal-passing": {
        if (isTreasurySpend) {
          direction = "short";
          confidence = 0.5;
          reasoning = `Treasury spend proposal passing in ${protocol.name}: "${proposal.title}"`;
        } else if (isUpgrade) {
          direction = "long";
          confidence = 0.5;
          reasoning = `Protocol upgrade proposal passing in ${protocol.name}: "${proposal.title}"`;
        } else {
          direction = "long"; // Generally positive for governance activity
          confidence = 0.3;
          reasoning = `Proposal passing in ${protocol.name}: "${proposal.title}"`;
        }
        break;
      }

      case "proposal-failing": {
        // Failing proposals have inverse signal
        if (isTreasurySpend) {
          direction = "long"; // Treasury NOT being spent → positive
          confidence = 0.4;
          reasoning = `Treasury spend proposal failing in ${protocol.name}: "${proposal.title}"`;
        } else if (isUpgrade) {
          direction = "short"; // Upgrade NOT happening → negative
          confidence = 0.4;
          reasoning = `Protocol upgrade proposal failing in ${protocol.name}: "${proposal.title}"`;
        } else {
          return null;
        }
        break;
      }

      case "proposal-executed": {
        // Executed proposals have strongest impact
        if (isTreasurySpend) {
          direction = "short";
          confidence = 0.6;
          reasoning = `Treasury spend executed in ${protocol.name}: "${proposal.title}"`;
        } else if (isUpgrade) {
          direction = "long";
          confidence = 0.6;
          reasoning = `Protocol upgrade executed in ${protocol.name}: "${proposal.title}"`;
        } else {
          direction = "long";
          confidence = 0.35;
          reasoning = `Proposal executed in ${protocol.name}: "${proposal.title}"`;
        }
        break;
      }

      case "large-vote-shift": {
        const totalVotes = proposal.forVotes + proposal.againstVotes;
        const forPct = totalVotes > 0 ? proposal.forVotes / totalVotes : 0.5;

        if (forPct > 0.6) {
          direction = isUpgrade ? "long" : isTreasurySpend ? "short" : "long";
          confidence = 0.45;
          reasoning = `Large vote shift toward passing in ${protocol.name} (${(forPct * 100).toFixed(0)}% for): "${proposal.title}"`;
        } else if (forPct < 0.4) {
          direction = isUpgrade ? "short" : isTreasurySpend ? "long" : "short";
          confidence = 0.4;
          reasoning = `Large vote shift toward defeat in ${protocol.name} (${(forPct * 100).toFixed(0)}% for): "${proposal.title}"`;
        } else {
          return null; // Split vote — no clear signal
        }
        break;
      }

      default:
        return null;
    }

    return {
      proposalId: proposal.id,
      protocol: proposal.protocol,
      tradeableAsset: protocol.tradeableToken,
      direction,
      confidence,
      reasoning,
      eventType,
    };
  }

  /* ═══════════════  Signal Emission  ═══════════════ */

  private async emitSignal(signal: GovernanceAlphaSignal): Promise<void> {
    try {
      await messageBus.publish({
        id: randomUUID(),
        from: this.id,
        to: "*",
        topic: "governance-alpha",
        payload: signal,
        timestamp: Date.now(),
      });
      this.signalsEmitted++;
      console.log(
        `[governance-watcher] Signal: ${signal.tradeableAsset} ${signal.direction} ` +
        `(${signal.eventType}, conf=${signal.confidence.toFixed(2)}) — ${signal.reasoning.slice(0, 100)}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.errors.push(`emit: ${msg}`);
    }
  }
}

/* ═══════════════════════════  Singleton + Registration  ═══════════════════════════ */

export const governanceWatcher = new GovernanceWatcherAgent();

// Auto-register with the agent registry
agentRegistry.register(governanceWatcher);
