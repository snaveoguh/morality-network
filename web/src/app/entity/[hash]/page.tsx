"use client";

import { useParams } from "next/navigation";
import { EntityProfile } from "@/components/entity/EntityProfile";

export default function EntityPage() {
  const params = useParams();
  const hash = params.hash as string;

  if (!hash || !hash.startsWith("0x")) {
    return (
      <div className="py-12 text-center text-zinc-400">
        Invalid entity hash.
      </div>
    );
  }

  return <EntityProfile entityHash={hash as `0x${string}`} />;
}
