import { ponder } from "@/generated";
import { entity } from "../ponder.schema";
import { ensureEntityRow } from "./entity-utils";

ponder.on("MoralityRegistry:EntityRegistered", async ({ event, context }) => {
  const { db } = context;
  await db.insert(entity).values({
    id: event.args.entityHash,
    identifier: event.args.identifier,
    entityType: event.args.entityType,
    registeredBy: event.args.registeredBy,
    firstSeen: event.block.timestamp,
    lastActivity: event.block.timestamp,
  }).onConflictDoUpdate({
    lastActivity: event.block.timestamp,
  });
});

ponder.on("MoralityRegistry:OwnershipClaimed", async ({ event, context }) => {
  const { db } = context;
  await ensureEntityRow(db, event.args.entityHash, event.block.timestamp);
  await db.update(entity, { id: event.args.entityHash }).set({
    owner: event.args.claimedOwner,
    lastActivity: event.block.timestamp,
  });
});
