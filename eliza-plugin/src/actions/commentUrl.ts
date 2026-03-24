/**
 * COMMENT_URL — Post an onchain comment on any URL via pooter.world
 *
 * Example triggers:
 *   "Comment on https://example.com: This article misrepresents the data"
 *   "Post a comment on https://nytimes.com saying great journalism"
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
  COMMENTS_ABI,
  REGISTRY_ABI,
  computeEntityHash,
} from "../contracts.js";

export const commentUrl: Action = {
  name: "COMMENT_URL",
  similes: [
    "COMMENT_ON_URL",
    "POST_COMMENT",
    "REPLY_URL",
    "DISCUSS_URL",
    "COMMENT_ARTICLE",
  ],
  description:
    "Post an onchain comment on a URL via pooter.world. Comments are permanent and build reputation.",

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
        return { success: false, text: "I need a URL to comment on." };
      }
      const url = urlMatch[0].replace(/[.,;!?)]+$/, "");

      // Extract comment content (everything after URL, cleaning up common prefixes)
      let commentText = text
        .replace(urlMatch[0], "")
        .replace(
          /^[\s]*(?:comment(?:ing)?|post(?:ing)?|say(?:ing)?|reply(?:ing)?)[\s]*(?:on|to|about)?[\s]*/i,
          "",
        )
        .replace(/^[\s\-:,]+|[\s\-:,]+$/g, "")
        .trim();

      if (!commentText) {
        return { success: false, text: "I need comment text to post." };
      }

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
        await callback({ text: `Posting comment on ${url}...` });
      }

      const entityHash = computeEntityHash(url);

      // Register entity if needed
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
          args: [url, 0],
          chain: base,
        });
      }

      // Post comment (parentId=0 for top-level)
      const txHash = await walletClient.writeContract({
        address: CONTRACTS.comments,
        abi: COMMENTS_ABI,
        functionName: "comment",
        args: [entityHash, commentText, 0n],
        chain: base,
      });

      return {
        success: true,
        text: `Posted comment on ${url} via pooter.world: "${commentText.slice(0, 80)}${commentText.length > 80 ? "..." : ""}". TX: ${txHash}`,
        data: { txHash, entityHash, url, commentText },
      };
    } catch (error: any) {
      return { success: false, text: `Comment failed: ${error.message}` };
    }
  },

  examples: [
    [
      {
        name: "{{user}}",
        content: {
          text: "Comment on https://example.com: This article has solid data backing its claims",
        },
      },
      {
        name: "{{agent}}",
        content: {
          text: 'Posted comment on https://example.com via pooter.world: "This article has solid data backing its claims".',
          actions: ["COMMENT_URL"],
        },
      },
    ],
  ],
};
