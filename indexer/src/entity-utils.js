import { entity } from "../ponder.schema";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const UNKNOWN_ENTITY_TYPE = 255;
export async function ensureEntityRow(db, entityHash, timestamp) {
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
//# sourceMappingURL=entity-utils.js.map