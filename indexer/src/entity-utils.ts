import { entity } from "../ponder.schema";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as `0x${string}`;
const UNKNOWN_ENTITY_TYPE = 255;

export async function ensureEntityRow(
  db: any,
  entityHash: `0x${string}`,
  timestamp: bigint,
): Promise<void> {
  await db
    .insert(entity)
    .values({
      id: entityHash,
      identifier: `unknown:${entityHash}`,
      entityType: UNKNOWN_ENTITY_TYPE,
      registeredBy: ZERO_ADDRESS,
      firstSeen: timestamp,
      lastActivity: timestamp,
    })
    .onConflictDoNothing();
}
