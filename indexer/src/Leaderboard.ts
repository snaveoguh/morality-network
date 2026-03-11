import { ponder } from "@/generated";
import { entity } from "../ponder.schema";
import { ensureEntityRow } from "./entity-utils";

ponder.on("MoralityLeaderboard:AIScoreUpdated", async ({ event, context }) => {
  const { db } = context;

  await ensureEntityRow(db, event.args.entityHash, event.block.timestamp);

  await db.update(entity, { id: event.args.entityHash }).set({
    aiScore: Number(event.args.score),
    lastActivity: event.block.timestamp,
  });
});
