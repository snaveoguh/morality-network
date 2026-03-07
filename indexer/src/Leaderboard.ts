import { ponder } from "@/generated";
import { entity } from "../ponder.schema";

ponder.on("MoralityLeaderboard:AIScoreUpdated", async ({ event, context }) => {
  const { db } = context;

  await db.update(entity, { id: event.args.entityHash }).set({
    aiScore: Number(event.args.score),
    lastActivity: event.block.timestamp,
  });
});
