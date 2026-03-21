import { NextRequest, NextResponse } from "next/server";
import { CONTRACTS, COMMENTS_ABI } from "@/lib/contracts";
import { baseContractsPublicClient } from "@/lib/server/onchain-clients";
import { rateLimit } from "@/lib/rate-limit";

const POLL_INTERVAL_MS = 5_000;
const STREAM_TTL_MS = 60_000;
const ENTITY_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;

export async function GET(req: NextRequest) {
  const limited = rateLimit(req, { maxRequests: 20, windowMs: 60_000 });
  if (limited) return limited;

  const entityHash = req.nextUrl.searchParams.get("entityHash");
  if (!entityHash || !ENTITY_HASH_PATTERN.test(entityHash)) {
    return NextResponse.json(
      { error: "entityHash query parameter is required" },
      { status: 400 },
    );
  }

  const normalizedEntityHash = entityHash.toLowerCase();

  const encoder = new TextEncoder();
  let lastKnownId = BigInt(0);
  let closed = false;

  const client = baseContractsPublicClient;

  // Get initial nextCommentId
  try {
    lastKnownId = await client.readContract({
      address: CONTRACTS.comments,
      abi: COMMENTS_ABI,
      functionName: "nextCommentId",
    });
  } catch {
    // Start from 1
    lastKnownId = BigInt(1);
  }

  const stream = new ReadableStream({
    async start(controller) {
      let interval: ReturnType<typeof setInterval> | null = null;
      const closeStream = (reason: string) => {
        if (closed) return;
        closed = true;
        if (interval) clearInterval(interval);
        clearTimeout(ttlTimer);
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: "closing", reason })}\n\n`)
          );
        } catch {}
        try {
          controller.close();
        } catch {}
      };

      // Send initial connected event
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "connected", lastKnownId: lastKnownId.toString() })}\n\n`
        )
      );

      // Backfill recent comments for this entity using getEntityComments if available,
      // otherwise fall back to scanning recent global IDs.
      try {
        // Use the efficient entity-scoped query
        try {
          const entityCount = await client.readContract({
            address: CONTRACTS.comments,
            abi: COMMENTS_ABI,
            functionName: "getEntityCommentCount",
            args: [normalizedEntityHash as `0x${string}`],
          });

          const count = Number(entityCount);
          if (count > 0) {
            const offset = count > 50 ? BigInt(count - 50) : BigInt(0);
            const ids = await client.readContract({
              address: CONTRACTS.comments,
              abi: COMMENTS_ABI,
              functionName: "getEntityComments",
              args: [normalizedEntityHash as `0x${string}`, offset, BigInt(50)],
            });

            for (const id of ids) {
              try {
                const comment = await client.readContract({
                  address: CONTRACTS.comments,
                  abi: COMMENTS_ABI,
                  functionName: "getComment",
                  args: [id],
                });
                if (!comment.exists) continue;

                const payload = {
                  type: "comment",
                  id: comment.id.toString(),
                  entityHash: comment.entityHash,
                  author: comment.author,
                  content: comment.content,
                  parentId: comment.parentId.toString(),
                  score: comment.score.toString(),
                  tipTotal: comment.tipTotal.toString(),
                  timestamp: comment.timestamp.toString(),
                };

                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
                );
              } catch {
                // Skip individual comment errors
              }
            }
          }
        } catch {
          // Fall through to global scan if entity query fails
          await backfillGlobal(client, lastKnownId, normalizedEntityHash, controller, encoder);
        }
      } catch {
        // Skip backfill if RPC read fails
      }

      const ttlTimer = setTimeout(() => {
        closeStream("reconnect");
      }, STREAM_TTL_MS);

      // Poll loop
      interval = setInterval(async () => {
        if (closed) {
          if (interval) clearInterval(interval);
          return;
        }

        try {
          const currentNextId = await client.readContract({
            address: CONTRACTS.comments,
            abi: COMMENTS_ABI,
            functionName: "nextCommentId",
          });

          if (currentNextId > lastKnownId) {
            // Fetch new comments
            for (let id = lastKnownId; id < currentNextId; id++) {
              try {
                const comment = await client.readContract({
                  address: CONTRACTS.comments,
                  abi: COMMENTS_ABI,
                  functionName: "getComment",
                  args: [id],
                });

                if (!comment.exists || comment.entityHash.toLowerCase() !== normalizedEntityHash) {
                  continue;
                }

                const payload = {
                  type: "comment",
                  id: comment.id.toString(),
                  entityHash: comment.entityHash,
                  author: comment.author,
                  content: comment.content,
                  parentId: comment.parentId.toString(),
                  score: comment.score.toString(),
                  tipTotal: comment.tipTotal.toString(),
                  timestamp: comment.timestamp.toString(),
                };

                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
                );
              } catch {
                // Skip individual comment errors
              }
            }
            lastKnownId = currentNextId;
          }

          // Heartbeat
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "heartbeat", t: Date.now() })}\n\n`
            )
          );
        } catch {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ type: "error", message: "Poll failed" })}\n\n`
            )
          );
        }
      }, POLL_INTERVAL_MS);

      // Cleanup on close
      req.signal.addEventListener("abort", () => {
        closeStream("client-abort");
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

/** Fallback: scan recent global comment IDs and filter by entity */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function backfillGlobal(
  client: any,
  lastKnownId: bigint,
  normalizedEntityHash: string | null,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
) {
  const backfillWindow = BigInt(50);
  const startId = lastKnownId > backfillWindow ? lastKnownId - backfillWindow : BigInt(1);
  for (let id = startId; id < lastKnownId; id++) {
    try {
      const comment = await client.readContract({
        address: CONTRACTS.comments,
        abi: COMMENTS_ABI,
        functionName: "getComment",
        args: [id],
      });
      if (!comment.exists) continue;
      if (
        normalizedEntityHash &&
        comment.entityHash.toLowerCase() !== normalizedEntityHash
      ) {
        continue;
      }

      const payload = {
        type: "comment",
        id: comment.id.toString(),
        entityHash: comment.entityHash,
        author: comment.author,
        content: comment.content,
        parentId: comment.parentId.toString(),
        score: comment.score.toString(),
        tipTotal: comment.tipTotal.toString(),
        timestamp: comment.timestamp.toString(),
      };

      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
      );
    } catch {
      // Skip individual backfill errors
    }
  }
}
