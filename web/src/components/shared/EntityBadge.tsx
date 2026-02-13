"use client";

import { EntityType } from "@/lib/contracts";
import { entityTypeLabel } from "@/lib/entity";

interface EntityBadgeProps {
  entityType: EntityType;
}

const colors: Record<EntityType, string> = {
  [EntityType.URL]: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  [EntityType.DOMAIN]: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  [EntityType.ADDRESS]:
    "bg-[#2F80ED]/10 text-[#31F387] border-[#2F80ED]/20",
  [EntityType.CONTRACT]:
    "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

export function EntityBadge({ entityType }: EntityBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${colors[entityType]}`}
    >
      {entityTypeLabel(entityType)}
    </span>
  );
}
