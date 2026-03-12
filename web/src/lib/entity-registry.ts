import "server-only";

import { CONTRACTS, REGISTRY_ABI } from "./contracts";
import { baseContractsPublicClient as registryClient } from "./server/onchain-clients";

export interface RegistryEntitySnapshot {
  entityHash: `0x${string}`;
  entityType: number;
  identifier: string;
  registeredBy: `0x${string}`;
  claimedOwner: `0x${string}`;
  createdAt: bigint;
  exists: boolean;
}

export function isHttpIdentifier(value: string | null | undefined): boolean {
  return /^https?:\/\//i.test((value || "").trim());
}

export async function getRegistryEntityByHash(
  entityHash: `0x${string}`,
): Promise<RegistryEntitySnapshot | null> {
  try {
    const entity = (await registryClient.readContract({
      address: CONTRACTS.registry,
      abi: REGISTRY_ABI,
      functionName: "getEntity",
      args: [entityHash],
    })) as {
      entityHash: `0x${string}`;
      entityType: number;
      identifier: string;
      registeredBy: `0x${string}`;
      claimedOwner: `0x${string}`;
      createdAt: bigint;
      exists: boolean;
    };

    if (!entity?.exists) return null;

    return {
      entityHash: entity.entityHash || entityHash,
      entityType: Number(entity.entityType ?? 0),
      identifier: String(entity.identifier || ""),
      registeredBy: entity.registeredBy,
      claimedOwner: entity.claimedOwner,
      createdAt:
        typeof entity.createdAt === "bigint"
          ? entity.createdAt
          : BigInt(entity.createdAt || 0),
      exists: Boolean(entity.exists),
    };
  } catch (error) {
    console.warn(
      "[entity-registry] failed to load entity by hash:",
      entityHash,
      error,
    );
    return null;
  }
}
