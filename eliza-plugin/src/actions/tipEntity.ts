/**
 * TIP_ENTITY — Send an ETH tip to any entity on pooter.world
 *
 * Example triggers:
 *   "Tip https://example.com 0.001 ETH"
 *   "Send a tip to 0xd8dA... for 0.01 ETH"
 */

import type {
  Action,
  IAgentRuntime,
  Memory,
  State,
  HandlerCallback,
} from "@elizaos/core";
import { createWalletClient, http, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { CONTRACTS, TIPPING_ABI, computeEntityHash } from "../contracts.js";

export const tipEntity: Action = {
  name: "TIP_ENTITY",
  similes: ["TIP_URL", "TIP_ADDRESS", "SEND_TIP", "TIP_ARTICLE"],
  description:
    "Tip an entity (URL, address, domain) with ETH on pooter.world. Tips go to claimed owner or escrow.",

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

      // Extract identifier (URL or address)
      const urlMatch = text.match(/https?:\/\/[^\s,]+/);
      const addrMatch = text.match(/0x[a-fA-F0-9]{40}/);
      const identifier = urlMatch?.[0]?.replace(/[.,;!?)]+$/, "") ?? addrMatch?.[0];

      if (!identifier) {
        return {
          success: false,
          text: "I need a URL or address to tip.",
        };
      }

      // Extract ETH amount
      const amountMatch = text.match(
        /([\d.]+)\s*(?:ETH|eth|Eth)/,
      );
      if (!amountMatch) {
        return { success: false, text: "I need an ETH amount (e.g., 0.001 ETH)." };
      }
      const ethAmount = amountMatch[1];

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

      if (callback) {
        await callback({ text: `Tipping ${identifier} ${ethAmount} ETH...` });
      }

      const entityHash = computeEntityHash(identifier);

      const txHash = await walletClient.writeContract({
        address: CONTRACTS.tipping,
        abi: TIPPING_ABI,
        functionName: "tipEntity",
        args: [entityHash],
        value: parseEther(ethAmount),
        chain: base,
      });

      return {
        success: true,
        text: `Tipped ${identifier} ${ethAmount} ETH on pooter.world. TX: ${txHash}`,
        data: { txHash, entityHash, identifier, ethAmount },
      };
    } catch (error: any) {
      return { success: false, text: `Tip failed: ${error.message}` };
    }
  },

  examples: [
    [
      {
        name: "{{user}}",
        content: { text: "Tip https://vitalik.eth.limo 0.001 ETH" },
      },
      {
        name: "{{agent}}",
        content: {
          text: "Tipped https://vitalik.eth.limo 0.001 ETH on pooter.world.",
          actions: ["TIP_ENTITY"],
        },
      },
    ],
  ],
};
