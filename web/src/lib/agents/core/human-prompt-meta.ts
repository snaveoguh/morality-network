import { getAddress, isAddress } from "viem";
import type { AgentMessage, AgentMessageMeta } from "./types";

interface HeaderLookup {
  get(name: string): string | null;
}

interface HumanPromptMetaOptions {
  headers?: HeaderLookup;
  relayedFrom?: string | null;
  receivedAt?: number;
  resolveEnsName?: (address: string) => Promise<string | null>;
}

const ENS_CACHE_TTL_MS = 15 * 60 * 1000;
const PROMPT_PREVIEW_LIMIT = 280;

const ensCache = new Map<string, { value: string | null; expiresAt: number }>();

const EXPLICIT_PROMPT_PATHS = [
  ["meta", "promptText"],
  ["payload", "prompt"],
  ["payload", "input"],
] as const;

const TEXT_PROMPT_PATHS = [
  ["payload", "message"],
  ["payload", "content"],
  ["payload", "text"],
] as const;

const ADDRESS_PATHS = [
  ["meta", "sender", "address"],
  ["payload", "senderAddress"],
  ["payload", "userAddress"],
  ["payload", "walletAddress"],
  ["payload", "authorAddress"],
  ["payload", "address"],
  ["payload", "account"],
  ["payload", "sender", "address"],
  ["payload", "user", "address"],
  ["payload", "author", "address"],
] as const;

const ENS_PATHS = [
  ["meta", "sender", "ens"],
  ["payload", "senderEns"],
  ["payload", "userEns"],
  ["payload", "walletEns"],
  ["payload", "authorEns"],
  ["payload", "ens"],
  ["payload", "ensName"],
  ["payload", "sender", "ens"],
  ["payload", "user", "ens"],
  ["payload", "author", "ens"],
] as const;

function getValueAtPath(
  source: unknown,
  path: readonly string[],
): unknown {
  let current = source;

  for (const segment of path) {
    if (!current || typeof current !== "object" || !(segment in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function firstNonEmptyString(values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function normalizeAddress(value: string | null): string | null {
  if (!value || !isAddress(value)) return null;
  return getAddress(value);
}

function buildPromptPreview(promptText: string): string {
  const singleLine = promptText.replace(/\s+/g, " ").trim();
  if (singleLine.length <= PROMPT_PREVIEW_LIMIT) return singleLine;
  return `${singleLine.slice(0, PROMPT_PREVIEW_LIMIT - 1)}…`;
}

async function resolveEnsName(address: string): Promise<string | null> {
  const cached = ensCache.get(address);
  const now = Date.now();

  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  let value: string | null = null;
  try {
    const { predictionMarketPublicClient } = await import("../../server/onchain-clients");
    value = await predictionMarketPublicClient.getEnsName({
      address: address as `0x${string}`,
    });
  } catch {
    value = null;
  }

  ensCache.set(address, {
    value,
    expiresAt: now + ENS_CACHE_TTL_MS,
  });

  return value;
}

export async function buildHumanPromptMeta(
  message: AgentMessage,
  options: HumanPromptMetaOptions = {},
): Promise<AgentMessageMeta | null> {
  const { headers, relayedFrom = null, receivedAt = Date.now() } = options;

  const senderAddress = normalizeAddress(
    firstNonEmptyString([
      ...ADDRESS_PATHS.map((path) => getValueAtPath(message, path)),
      headers?.get("x-agent-sender-address"),
    ]),
  );

  let senderEns = firstNonEmptyString([
    ...ENS_PATHS.map((path) => getValueAtPath(message, path)),
    headers?.get("x-agent-sender-ens"),
  ]);

  if (!senderEns && senderAddress) {
    const resolver = options.resolveEnsName ?? resolveEnsName;
    senderEns = await resolver(senderAddress);
  }

  const explicitPromptText = firstNonEmptyString([
    ...EXPLICIT_PROMPT_PATHS.map((path) => getValueAtPath(message, path)),
    headers?.get("x-agent-prompt"),
  ]);

  const inferredPromptText = firstNonEmptyString(
    TEXT_PROMPT_PATHS.map((path) => getValueAtPath(message, path)),
  );

  const likelyHumanTopic = /prompt|chat|human|user|query|ask|message/i.test(
    `${message.topic} ${message.from}`,
  );

  const promptText =
    explicitPromptText ||
    (inferredPromptText && (Boolean(senderAddress) || Boolean(senderEns) || likelyHumanTopic)
      ? inferredPromptText
      : null);

  if (!promptText) {
    return null;
  }

  return {
    sender: {
      address: senderAddress,
      ens: senderEns,
    },
    humanPrompt: true,
    promptText,
    promptPreview: buildPromptPreview(promptText),
    relayedFrom,
    receivedAt,
  };
}
