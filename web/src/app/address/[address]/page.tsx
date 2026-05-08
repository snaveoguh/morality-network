"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useEnsAddress, useEnsName, useEnsAvatar } from "wagmi";
import { mainnet } from "wagmi/chains";
import { useBytecode } from "wagmi";
import { shortenAddress } from "@/lib/entity";
import { OverviewTab } from "@/components/explorer/OverviewTab";

// Tab structure removed — Read / Interact / Code / Activity were placeholders
// ("coming soon"). Until those panels are built, the page renders the
// Overview tab directly. Re-introduce the tabs here when implementing them.

export default function AddressPage() {
  const params = useParams<{ address: string }>();
  const rawAddress = decodeURIComponent(params.address ?? "");

  const isEns = rawAddress.endsWith(".eth");
  const isHexAddress = /^0x[a-fA-F0-9]{40}$/i.test(rawAddress);

  // --- ENS resolution (name -> address) ---
  const { data: resolvedFromEns, isLoading: ensResolving } = useEnsAddress({
    name: isEns ? rawAddress : undefined,
    chainId: mainnet.id,
    query: { enabled: isEns, staleTime: 1000 * 60 * 60 },
  });

  // The canonical hex address
  const address: `0x${string}` | undefined = isHexAddress
    ? (rawAddress as `0x${string}`)
    : resolvedFromEns ?? undefined;

  // --- Reverse ENS (address -> name) for hex-address URLs ---
  const { data: ensName } = useEnsName({
    address: isHexAddress ? (rawAddress as `0x${string}`) : undefined,
    chainId: mainnet.id,
    query: { enabled: isHexAddress, staleTime: 1000 * 60 * 60 },
  });

  const { data: ensAvatar } = useEnsAvatar({
    name: ensName ?? (isEns ? rawAddress : undefined) ?? undefined,
    chainId: mainnet.id,
    query: {
      enabled: !!(ensName || isEns),
      staleTime: 1000 * 60 * 60,
    },
  });

  // --- Contract detection via bytecode ---
  const { data: bytecode, isLoading: bytecodeLoading } = useBytecode({
    address: address,
    query: { enabled: !!address },
  });

  const isContract = !!bytecode && bytecode !== "0x";
  const isLoading = ensResolving || bytecodeLoading;

  // --- Display values ---
  const displayName = ensName ?? (isEns ? rawAddress : null);
  const shortAddr = address ? shortenAddress(address, 6) : "...";
  const breadcrumbName = displayName ?? shortAddr;

  // --- Copy to clipboard ---
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    if (!address) return;
    navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  // --- Invalid address ---
  if (!isEns && !isHexAddress) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 text-center">
        <p className="font-mono text-sm text-[var(--ink-faint)]">
          Invalid address or ENS name.
        </p>
      </div>
    );
  }

  // --- Loading state ---
  if (isLoading || !address) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-[var(--ink-faint)]">
          <span className="inline-block h-2.5 w-2.5 animate-spin border border-[var(--ink-faint)] border-t-transparent" />
          {isEns ? `Resolving ${rawAddress}...` : "Loading..."}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      {/* Breadcrumb */}
      <div className="mb-4 font-mono text-[9px] uppercase tracking-[0.3em] text-[var(--ink-faint)]">
        <span className="hover:text-[var(--ink)] transition-colors">EVM NOW</span>
        <span className="mx-1.5">&gt;</span>
        <span className="text-[var(--ink-light)]">{breadcrumbName}</span>
      </div>

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start gap-3">
          {/* ENS Avatar */}
          {ensAvatar && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={ensAvatar}
              alt=""
              className="mt-0.5 h-10 w-10 rounded-full border border-[var(--rule-light)] object-cover"
            />
          )}

          <div className="min-w-0 flex-1">
            {/* Name + Badge */}
            <div className="flex items-center gap-2">
              <h1 className="truncate font-mono text-lg font-bold text-[var(--ink)]">
                {displayName ?? shortAddr}
              </h1>
              <span
                className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[0.2em] ${
                  isContract
                    ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
                    : "border-[var(--rule)] bg-[var(--paper-dark)] text-[var(--ink-light)]"
                }`}
              >
                {isContract ? "CONTRACT" : "EOA"}
              </span>
            </div>

            {/* Full address + copy */}
            <div className="mt-1 flex items-center gap-2">
              <span className="truncate font-mono text-[11px] text-[var(--ink-light)]">
                {address}
              </span>
              <button
                onClick={handleCopy}
                className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
                title="Copy address"
              >
                {copied ? "COPIED" : "COPY"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="mt-3 border-t border-[var(--rule)]" />

      {/* Overview — additional tabs (Read / Interact / Code / Activity) will
          land here once the corresponding components are built. */}
      <div className="mt-6">
        <OverviewTab address={address} isContract={isContract} />
      </div>
    </div>
  );
}
