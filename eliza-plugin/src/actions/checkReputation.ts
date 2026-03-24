/**
 * CHECK_REPUTATION — Look up any entity's reputation score and ratings on pooter.world
 *
 * Example triggers:
 *   "Check reputation of https://example.com"
 *   "What's the pooter score for 0xd8dA..."
 *   "How is https://nytimes.com rated?"
 */

import type {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
} from "@elizaos/core";
import { createPublicClient, http, formatEther } from "viem";
import { base } from "viem/chains";
import {
  CONTRACTS,
  RATINGS_ABI,
  LEADERBOARD_ABI,
  TIPPING_ABI,
  COMMENTS_ABI,
  computeEntityHash,
} from "../contracts.js";

export const checkReputation: Action = {
  name: "CHECK_REPUTATION",
  similes: [
    "CHECK_SCORE",
    "GET_RATING",
    "LOOKUP_REPUTATION",
    "POOTER_SCORE",
    "CHECK_RATINGS",
  ],
  description:
    "Check an entity's reputation score, average rating, tip total, and comment count on pooter.world. Read-only, no gas cost.",

  validate: async (_runtime: IAgentRuntime, _message: Memory) => {
    return true; // Read-only, no wallet needed
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    _options: any,
    callback?: HandlerCallback,
  ) => {
    try {
      const text = message.content?.text ?? "";

      // Extract identifier
      const urlMatch = text.match(/https?:\/\/[^\s,]+/);
      const addrMatch = text.match(/0x[a-fA-F0-9]{40}/);
      const domainMatch = text.match(
        /\b([a-zA-Z0-9-]+\.[a-zA-Z]{2,}(?:\.[a-zA-Z]{2,})?)\b/,
      );
      const identifier =
        urlMatch?.[0]?.replace(/[.,;!?)]+$/, "") ??
        addrMatch?.[0] ??
        domainMatch?.[1];

      if (!identifier) {
        return {
          success: false,
          text: "I need a URL, address, or domain to look up.",
        };
      }

      const rpcUrl =
        runtime.getSetting("BASE_RPC_URL") || "https://mainnet.base.org";
      const publicClient = createPublicClient({
        chain: base,
        transport: http(rpcUrl),
      });

      if (callback) {
        await callback({ text: `Looking up ${identifier} on pooter.world...` });
      }

      const entityHash = computeEntityHash(identifier);

      // Fetch all metrics in parallel
      const [ratingResult, compositeScore, tipTotal, commentCount] =
        await Promise.all([
          publicClient
            .readContract({
              address: CONTRACTS.ratings,
              abi: RATINGS_ABI,
              functionName: "getAverageRating",
              args: [entityHash],
            })
            .catch(() => [0n, 0n] as const),
          publicClient
            .readContract({
              address: CONTRACTS.leaderboard,
              abi: LEADERBOARD_ABI,
              functionName: "getCompositeScore",
              args: [entityHash],
            })
            .catch(() => 0n),
          publicClient
            .readContract({
              address: CONTRACTS.tipping,
              abi: TIPPING_ABI,
              functionName: "entityTipTotals",
              args: [entityHash],
            })
            .catch(() => 0n as unknown as bigint),
          publicClient
            .readContract({
              address: CONTRACTS.comments,
              abi: COMMENTS_ABI,
              functionName: "getEntityCommentCount",
              args: [entityHash],
            })
            .catch(() => 0n),
        ]);

      const [avg, count] = ratingResult;
      const avgRating = Number(count) > 0 ? (Number(avg) / 100).toFixed(2) : "unrated";
      const score = (Number(compositeScore) / 100).toFixed(2);
      const tips = formatEther(tipTotal as bigint);
      const comments = Number(commentCount);

      const summary = [
        `**${identifier}** on pooter.world:`,
        `  Rating: ${avgRating}/5 (${count} ratings)`,
        `  Composite Score: ${score}/100`,
        `  Tips: ${tips} ETH`,
        `  Comments: ${comments}`,
      ].join("\n");

      return {
        success: true,
        text: summary,
        data: {
          entityHash,
          identifier,
          avgRating,
          ratingCount: Number(count),
          compositeScore: score,
          tipTotal: tips,
          commentCount: comments,
        },
      };
    } catch (error: any) {
      return { success: false, text: `Lookup failed: ${error.message}` };
    }
  },

  examples: [
    [
      {
        name: "{{user}}",
        content: { text: "Check the reputation of https://vitalik.eth.limo" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "**https://vitalik.eth.limo** on pooter.world:\n  Rating: 4.50/5 (12 ratings)\n  Composite Score: 72.50/100\n  Tips: 0.15 ETH\n  Comments: 8",
          actions: ["CHECK_REPUTATION"],
        },
      },
    ],
  ],
};
