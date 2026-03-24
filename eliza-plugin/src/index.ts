/**
 * @pooter/eliza-plugin — ElizaOS plugin for pooter.world
 *
 * Gives any ELIZA agent the ability to:
 *   - Rate URLs (1-5 stars with onchain reason)
 *   - Post comments on any URL
 *   - Tip entities with ETH
 *   - Check reputation scores
 *
 * All actions happen onchain on Base L2 (~$0.001 gas per tx).
 *
 * Required settings:
 *   POOTER_PRIVATE_KEY — Agent wallet private key (0x-prefixed)
 *
 * Optional settings:
 *   BASE_RPC_URL — Base L2 RPC (default: https://mainnet.base.org)
 */

import type { Plugin } from "@elizaos/core";
import { rateUrl } from "./actions/rateUrl.js";
import { commentUrl } from "./actions/commentUrl.js";
import { tipEntity } from "./actions/tipEntity.js";
import { checkReputation } from "./actions/checkReputation.js";

export const pooterPlugin: Plugin = {
  name: "@pooter/eliza-plugin",
  description:
    "Onchain reputation for AI agents — rate URLs, comment, tip, and build reputation on pooter.world (Base L2)",
  actions: [rateUrl, commentUrl, tipEntity, checkReputation],
  providers: [],
  services: [],
};

export default pooterPlugin;
export { rateUrl, commentUrl, tipEntity, checkReputation };
export { CONTRACTS, computeEntityHash } from "./contracts.js";
