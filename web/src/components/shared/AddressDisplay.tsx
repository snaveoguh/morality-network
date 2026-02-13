"use client";

import { shortenAddress } from "@/lib/entity";

interface AddressDisplayProps {
  address: string;
  chars?: number;
  className?: string;
}

export function AddressDisplay({
  address,
  chars = 4,
  className = "",
}: AddressDisplayProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-sm ${className}`}
      title={address}
    >
      <span className="h-2 w-2 rounded-full bg-[#31F387]" />
      {shortenAddress(address, chars)}
    </span>
  );
}
