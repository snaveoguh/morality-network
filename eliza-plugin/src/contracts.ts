/**
 * Pooter.world contract addresses and ABIs for Base L2.
 * Minimal ABIs — only the functions agents actually call.
 */

import { type Address, keccak256, toBytes } from "viem";

export const CONTRACTS = {
  registry: "0x2ea7502C4db5B8cfB329d8a9866EB6705b036608" as Address,
  ratings: "0x29F66D8b15326cE7232c0277DBc2CbFDaaf93405" as Address,
  comments: "0x66BA3cE1280bF86DFe957B52e9888A1De7F81d7b" as Address,
  tipping: "0x27c79A57BE68EB62c9C6bB19875dB76D33FD099B" as Address,
  leaderboard: "0x29f0235d74E09536f0b7dF9C6529De17B8aF5Fc6" as Address,
} as const;

export const BASE_CHAIN_ID = 8453;

export function computeEntityHash(identifier: string): `0x${string}` {
  return keccak256(toBytes(identifier));
}

export const REGISTRY_ABI = [
  {
    type: "function",
    name: "registerEntity",
    inputs: [
      { name: "identifier", type: "string" },
      { name: "entityType", type: "uint8" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getEntity",
    inputs: [{ name: "entityHash", type: "bytes32" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "entityHash", type: "bytes32" },
          { name: "entityType", type: "uint8" },
          { name: "identifier", type: "string" },
          { name: "registeredBy", type: "address" },
          { name: "claimedOwner", type: "address" },
          { name: "createdAt", type: "uint256" },
          { name: "exists", type: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
] as const;

export const RATINGS_ABI = [
  {
    type: "function",
    name: "rateWithReason",
    inputs: [
      { name: "entityHash", type: "bytes32" },
      { name: "score", type: "uint8" },
      { name: "reason", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getAverageRating",
    inputs: [{ name: "entityHash", type: "bytes32" }],
    outputs: [
      { name: "avg", type: "uint256" },
      { name: "count", type: "uint256" },
    ],
    stateMutability: "view",
  },
] as const;

export const COMMENTS_ABI = [
  {
    type: "function",
    name: "comment",
    inputs: [
      { name: "entityHash", type: "bytes32" },
      { name: "content", type: "string" },
      { name: "parentId", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getEntityComments",
    inputs: [
      { name: "entityHash", type: "bytes32" },
      { name: "offset", type: "uint256" },
      { name: "limit", type: "uint256" },
    ],
    outputs: [{ name: "", type: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getComment",
    inputs: [{ name: "commentId", type: "uint256" }],
    outputs: [
      {
        name: "",
        type: "tuple",
        components: [
          { name: "id", type: "uint256" },
          { name: "entityHash", type: "bytes32" },
          { name: "author", type: "address" },
          { name: "content", type: "string" },
          { name: "parentId", type: "uint256" },
          { name: "score", type: "int256" },
          { name: "tipTotal", type: "uint256" },
          { name: "timestamp", type: "uint256" },
          { name: "exists", type: "bool" },
        ],
      },
    ],
    stateMutability: "view",
  },
] as const;

export const TIPPING_ABI = [
  {
    type: "function",
    name: "tipEntity",
    inputs: [{ name: "entityHash", type: "bytes32" }],
    outputs: [],
    stateMutability: "payable",
  },
  {
    type: "function",
    name: "balances",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "withdraw",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
] as const;

export const LEADERBOARD_ABI = [
  {
    type: "function",
    name: "getCompositeScore",
    inputs: [{ name: "entityHash", type: "bytes32" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
  },
] as const;
