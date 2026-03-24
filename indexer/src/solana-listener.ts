/**
 * Solana Listener — Sidecar that watches the Morality Solana program
 * and writes events into the same Ponder database via the worker API.
 *
 * Architecture:
 *   Solana RPC (free Helius/Triton) → this listener → Ponder worker API → same DB
 *
 * This runs as a separate process alongside `ponder start`.
 * Cost: ~$0/month on free Solana RPC tiers (Helius: 100k req/day free).
 *
 * Usage:
 *   SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=xxx \
 *   MORALITY_PROGRAM_ID=Mora1ity... \
 *   INDEXER_URL=http://localhost:42069 \
 *   INDEXER_WORKER_SECRET=xxx \
 *   npx tsx src/solana-listener.ts
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { keccak256, toBytes, toHex } from "viem";

// ── Config ────────────────────────────────────────────────────────────

const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";
const PROGRAM_ID = new PublicKey(
  process.env.MORALITY_PROGRAM_ID ??
    "Mora1ityXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
);
const INDEXER_URL =
  process.env.INDEXER_URL ?? "http://localhost:42069";
const WORKER_SECRET = process.env.INDEXER_WORKER_SECRET ?? "";
const POLL_INTERVAL_MS = Number(process.env.SOLANA_POLL_MS ?? "5000");

// ── Anchor discriminators (first 8 bytes of sha256("global:<method>")) ──

// These identify which instruction was called in a transaction.
// We compute them from the instruction name to match Anchor's convention.
async function sha256(data: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(data));
  return new Uint8Array(hash);
}

// Precomputed discriminators for our instructions
const DISCRIMINATORS: Record<string, string> = {};

async function initDiscriminators() {
  const methods = [
    "register_entity",
    "rate",
    "rate_with_reason",
    "rate_interpretation",
    "post_comment",
    "vote_comment",
    "tip_entity",
    "tip_comment",
    "withdraw_tips",
    "claim_escrow",
    "update_ai_score",
  ];

  for (const method of methods) {
    const hash = await sha256(`global:${method}`);
    DISCRIMINATORS[method] = Buffer.from(hash.slice(0, 8)).toString("hex");
  }
}

// ── Ponder worker API client ──────────────────────────────────────────

async function postToIndexer(
  endpoint: string,
  body: Record<string, unknown>,
): Promise<boolean> {
  try {
    const res = await fetch(`${INDEXER_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${WORKER_SECRET}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(
        `[solana-listener] POST ${endpoint} failed: ${res.status} ${await res.text()}`,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error(`[solana-listener] POST ${endpoint} error:`, err);
    return false;
  }
}

// ── Transaction parser ────────────────────────────────────────────────

interface ParsedAction {
  type: string;
  entityHash?: string;
  actor: string;
  data: Record<string, unknown>;
  signature: string;
  slot: number;
  timestamp: number;
}

function parseInstructionData(
  data: Buffer,
  accounts: string[],
  signature: string,
  slot: number,
  timestamp: number,
): ParsedAction | null {
  if (data.length < 8) return null;

  const disc = data.subarray(0, 8).toString("hex");

  // Find which instruction this discriminator matches
  for (const [method, expectedDisc] of Object.entries(DISCRIMINATORS)) {
    if (disc !== expectedDisc) continue;

    const payload = data.subarray(8);
    // The signer is typically accounts[last_mut_signer] — for our instructions
    // it's usually the last account in the list
    const actor = accounts[accounts.length - 2] ?? accounts[0] ?? "unknown";

    switch (method) {
      case "register_entity": {
        // Decode: identifier (string: 4-byte len + utf8), entity_type (u8)
        const identifierLen = payload.readUInt32LE(0);
        const identifier = payload
          .subarray(4, 4 + identifierLen)
          .toString("utf8");
        const entityType = payload[4 + identifierLen] ?? 0;
        const entityHash = keccak256(toBytes(identifier));
        return {
          type: "register",
          entityHash,
          actor,
          data: { identifier, entityType },
          signature,
          slot,
          timestamp,
        };
      }

      case "rate":
      case "rate_with_reason": {
        // Entity hash comes from the entity PDA account (accounts[0] after config)
        // Score is first byte of payload
        const score = payload[0] ?? 0;
        let reason = "";
        if (method === "rate_with_reason" && payload.length > 1) {
          const reasonLen = payload.readUInt32LE(1);
          reason = payload.subarray(5, 5 + reasonLen).toString("utf8");
        }
        return {
          type: "rate",
          actor,
          data: { score, reason, chain: "solana" },
          signature,
          slot,
          timestamp,
        };
      }

      case "post_comment": {
        const contentLen = payload.readUInt32LE(0);
        const content = payload
          .subarray(4, 4 + contentLen)
          .toString("utf8");
        const parentIdOffset = 4 + contentLen;
        const parentId =
          parentIdOffset + 8 <= payload.length
            ? Number(payload.readBigUInt64LE(parentIdOffset))
            : 0;
        return {
          type: "comment",
          actor,
          data: { content, parentId, chain: "solana" },
          signature,
          slot,
          timestamp,
        };
      }

      case "tip_entity":
      case "tip_comment": {
        const amount =
          payload.length >= 8
            ? Number(payload.readBigUInt64LE(0))
            : 0;
        return {
          type: "tip",
          actor,
          data: {
            amount,
            amountSol: amount / 1e9,
            target: method === "tip_comment" ? "comment" : "entity",
            chain: "solana",
          },
          signature,
          slot,
          timestamp,
        };
      }

      case "vote_comment": {
        const vote = payload.readInt8(0);
        return {
          type: "vote",
          actor,
          data: { vote, chain: "solana" },
          signature,
          slot,
          timestamp,
        };
      }

      case "update_ai_score": {
        const score =
          payload.length >= 8
            ? Number(payload.readBigUInt64LE(0))
            : 0;
        return {
          type: "ai_score",
          actor,
          data: { score, chain: "solana" },
          signature,
          slot,
          timestamp,
        };
      }

      default:
        return null;
    }
  }

  return null;
}

// ── Main polling loop ─────────────────────────────────────────────────

async function main() {
  await initDiscriminators();

  const connection = new Connection(SOLANA_RPC_URL, "confirmed");
  let lastSignature: string | undefined;

  console.log(`[solana-listener] Starting...`);
  console.log(`  Program: ${PROGRAM_ID.toBase58()}`);
  console.log(`  RPC: ${SOLANA_RPC_URL.replace(/api-key=.*/, "api-key=***")}`);
  console.log(`  Indexer: ${INDEXER_URL}`);
  console.log(`  Poll interval: ${POLL_INTERVAL_MS}ms`);

  // Get initial cursor
  try {
    const sigs = await connection.getSignaturesForAddress(PROGRAM_ID, {
      limit: 1,
    });
    if (sigs.length > 0) {
      lastSignature = sigs[0]!.signature;
      console.log(`[solana-listener] Starting from signature: ${lastSignature}`);
    }
  } catch (err) {
    console.error("[solana-listener] Failed to get initial cursor:", err);
  }

  // Poll loop
  while (true) {
    try {
      const sigs = await connection.getSignaturesForAddress(PROGRAM_ID, {
        limit: 50,
        ...(lastSignature ? { until: lastSignature } : {}),
      });

      if (sigs.length > 0) {
        console.log(
          `[solana-listener] Processing ${sigs.length} new transactions`,
        );

        // Process oldest first
        for (const sig of sigs.reverse()) {
          if (sig.err) continue; // Skip failed txs

          try {
            const tx = await connection.getTransaction(sig.signature, {
              maxSupportedTransactionVersion: 0,
            });

            if (!tx?.meta || !tx.transaction.message) continue;

            const message = tx.transaction.message;
            const accountKeys =
              "staticAccountKeys" in message
                ? (message as any).staticAccountKeys.map((k: PublicKey) =>
                    k.toBase58(),
                  )
                : (message as any).accountKeys?.map((k: PublicKey) =>
                    k.toBase58(),
                  ) ?? [];

            // Find our program's instructions
            const instructions =
              "compiledInstructions" in message
                ? (message as any).compiledInstructions
                : (message as any).instructions ?? [];

            for (const ix of instructions) {
              const programIdIndex =
                "programIdIndex" in ix ? ix.programIdIndex : ix.programIndex;
              if (accountKeys[programIdIndex] !== PROGRAM_ID.toBase58())
                continue;

              const ixAccounts = (ix.accountKeyIndexes ?? ix.accounts ?? []).map(
                (idx: number) => accountKeys[idx] ?? "unknown",
              );
              const ixData = Buffer.from(ix.data);

              const action = parseInstructionData(
                ixData,
                ixAccounts,
                sig.signature,
                sig.slot,
                sig.blockTime ?? Math.floor(Date.now() / 1000),
              );

              if (action) {
                // Write to indexer via worker API as a feed item
                await postToIndexer("/api/feed-items", {
                  entityId:
                    action.entityHash ??
                    "0x0000000000000000000000000000000000000000000000000000000000000000",
                  actor: action.actor,
                  actionType:
                    action.type === "rate"
                      ? 0
                      : action.type === "comment"
                        ? 1
                        : action.type === "tip"
                          ? 2
                          : action.type === "vote"
                            ? 4
                            : 0,
                  data: JSON.stringify({
                    ...action.data,
                    solanaSignature: action.signature,
                    solanaSlot: action.slot,
                  }),
                  timestamp: action.timestamp,
                  txHash: `0x${Buffer.from(action.signature).toString("hex").padEnd(64, "0")}`,
                });

                console.log(
                  `[solana-listener] ${action.type} by ${action.actor.slice(0, 8)}...`,
                );
              }
            }
          } catch (err) {
            console.error(
              `[solana-listener] Failed to process tx ${sig.signature}:`,
              err,
            );
          }
        }

        lastSignature = sigs[0]!.signature;
      }
    } catch (err) {
      console.error("[solana-listener] Poll error:", err);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
}

main().catch((err) => {
  console.error("[solana-listener] Fatal:", err);
  process.exit(1);
});
