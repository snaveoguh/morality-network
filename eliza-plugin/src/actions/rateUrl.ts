/**
 * RATE_URL — Rate any URL on pooter.world (1-5 stars with reason)
 *
 * Example triggers:
 *   "Rate https://example.com 4 stars - good reporting"
 *   "Give https://nytimes.com a 5, great investigative piece"
 */

import type {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
} from "@elizaos/core";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import {
  CONTRACTS,
  RATINGS_ABI,
  REGISTRY_ABI,
  computeEntityHash,
} from "../contracts.js";

export const rateUrl: Action = {
  name: "RATE_URL",
  similes: [
    "RATE_WEBSITE",
    "RATE_LINK",
    "RATE_ARTICLE",
    "SCORE_URL",
    "REVIEW_URL",
  ],
  description:
    "Rate a URL on pooter.world with 1-5 stars and an onchain reason. Costs ~$0.001 gas on Base L2.",

  validate: async (runtime: IAgentRuntime, _message: Memory) => {
    const key = runtime.getSetting("POOTER_PRIVATE_KEY");
    return Boolean(key);
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

      // Extract URL
      const urlMatch = text.match(/https?:\/\/[^\s,]+/);
      if (!urlMatch) {
        return { success: false, text: "I need a URL to rate." };
      }
      const url = urlMatch[0].replace(/[.,;!?)]+$/, "");

      // Extract score (1-5)
      const scoreMatch = text.match(/\b([1-5])\b/);
      const score = scoreMatch ? parseInt(scoreMatch[1]) : 3;

      // Extract reason (everything after the score or after the URL)
      const reason =
        text
          .replace(urlMatch[0], "")
          .replace(/\b[1-5]\s*(stars?)?\b/i, "")
          .replace(/^[\s\-:,]+|[\s\-:,]+$/g, "")
          .trim() || "Rated by AI agent";

      const account = privateKeyToAccount(
        runtime.getSetting("POOTER_PRIVATE_KEY") as `0x${string}`,
      );
      const rpcUrl =
        runtime.getSetting("BASE_RPC_URL") || "https://mainnet.base.org";
      const walletClient = createWalletClient({
        account,
        chain: base,
        transport: http(rpcUrl),
      });
      const publicClient = createPublicClient({
        chain: base,
        transport: http(rpcUrl),
      });

      if (callback) {
        await callback({
          text: `Rating ${url} with ${score}/5 stars on pooter.world...`,
        });
      }

      const entityHash = computeEntityHash(url);

      // Check if entity exists, register if not
      const entity = await publicClient.readContract({
        address: CONTRACTS.registry,
        abi: REGISTRY_ABI,
        functionName: "getEntity",
        args: [entityHash],
      });

      if (!entity.exists) {
        await walletClient.writeContract({
          address: CONTRACTS.registry,
          abi: REGISTRY_ABI,
          functionName: "registerEntity",
          args: [url, 0], // 0 = URL
          chain: base,
        });
      }

      // Rate
      const txHash = await walletClient.writeContract({
        address: CONTRACTS.ratings,
        abi: RATINGS_ABI,
        functionName: "rateWithReason",
        args: [entityHash, score, reason],
        chain: base,
      });

      // Read current average
      const [avg, count] = await publicClient.readContract({
        address: CONTRACTS.ratings,
        abi: RATINGS_ABI,
        functionName: "getAverageRating",
        args: [entityHash],
      });

      const avgRating = (Number(avg) / 100).toFixed(2);

      return {
        success: true,
        text: `Rated ${url} ${score}/5 on pooter.world. Average now ${avgRating}/5 (${count} ratings). TX: ${txHash}`,
        data: { txHash, entityHash, score, avgRating, count: Number(count) },
      };
    } catch (error: any) {
      return { success: false, text: `Rating failed: ${error.message}` };
    }
  },

  examples: [
    [
      {
        name: "{{user}}",
        content: {
          text: "Rate https://vitalik.eth.limo 5 stars - essential reading for any agent",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Rated https://vitalik.eth.limo 5/5 on pooter.world. Average now 4.50/5 (12 ratings).",
          actions: ["RATE_URL"],
        },
      },
    ],
    [
      {
        name: "{{user}}",
        content: {
          text: "Give https://cnn.com a 2, clickbait headline",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Rated https://cnn.com 2/5 on pooter.world. Average now 2.80/5 (34 ratings).",
          actions: ["RATE_URL"],
        },
      },
    ],
  ],
};
