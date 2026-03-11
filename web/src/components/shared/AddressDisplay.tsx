"use client";

import { useEnsName, useEnsAvatar } from "wagmi";
import { mainnet } from "wagmi/chains";
import { shortenAddress } from "@/lib/entity";

interface AddressDisplayProps {
  address: string;
  chars?: number;
  className?: string;
  /** Show ENS avatar as a tiny circle (default true) */
  showAvatar?: boolean;
}

export function AddressDisplay({
  address,
  chars = 4,
  className = "",
  showAvatar = true,
}: AddressDisplayProps) {
  const isValidAddress = /^0x[a-fA-F0-9]{40}$/.test(address);

  const { data: ensName } = useEnsName({
    address: isValidAddress ? (address as `0x${string}`) : undefined,
    chainId: mainnet.id,
    query: { enabled: isValidAddress, staleTime: 1000 * 60 * 60 }, // cache 1hr
  });

  const { data: ensAvatar } = useEnsAvatar({
    name: ensName ?? undefined,
    chainId: mainnet.id,
    query: { enabled: !!ensName && showAvatar, staleTime: 1000 * 60 * 60 },
  });

  const displayName = ensName || shortenAddress(address, chars);

  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-sm ${className}`}
      title={ensName ? `${ensName} (${address})` : address}
    >
      {ensAvatar ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={ensAvatar}
          alt=""
          className="h-3.5 w-3.5 rounded-full object-cover"
        />
      ) : (
        <span className={`h-2 w-2 rounded-full ${ensName ? "bg-[#6E9EF5]" : "bg-[#31F387]"}`} />
      )}
      {displayName}
    </span>
  );
}
