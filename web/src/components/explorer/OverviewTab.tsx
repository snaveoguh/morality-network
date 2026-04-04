"use client";

import { useBalance, useEnsName, useEnsAvatar } from "wagmi";
import { mainnet } from "wagmi/chains";
import { computeEntityHash } from "@/lib/entity";
import { RatingWidget } from "@/components/entity/RatingWidget";
import { CommentThread } from "@/components/entity/CommentThread";

interface OverviewTabProps {
  address: `0x${string}`;
  isContract: boolean;
}

export function OverviewTab({ address, isContract }: OverviewTabProps) {
  const entityHash = computeEntityHash(address.toLowerCase());

  // --- ETH Balance ---
  const { data: balance, isLoading: balanceLoading } = useBalance({
    address,
  });

  // --- ENS reverse lookup ---
  const { data: ensName } = useEnsName({
    address,
    chainId: mainnet.id,
    query: { staleTime: 1000 * 60 * 60 },
  });

  const { data: ensAvatar } = useEnsAvatar({
    name: ensName ?? undefined,
    chainId: mainnet.id,
    query: { enabled: !!ensName, staleTime: 1000 * 60 * 60 },
  });

  const ethDisplay = balance
    ? `${parseFloat(String(Number(balance.value) / 1e18)).toFixed(4)}`
    : "---";

  return (
    <div className="space-y-6">
      {/* Balance + ENS Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Balance Card */}
        <div className="rounded border border-[var(--rule-light)] bg-[var(--paper)] p-4">
          <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.3em] text-[var(--ink-faint)]">
            Balance
          </div>
          <div className="flex items-baseline gap-1">
            <span className="font-mono text-xl font-bold text-[var(--ink)]">
              {balanceLoading ? (
                <span className="inline-block h-2.5 w-2.5 animate-spin border border-[var(--ink-faint)] border-t-transparent" />
              ) : (
                <>
                  <span className="mr-0.5 text-[var(--ink-light)]">Ξ</span>
                  {ethDisplay}
                </>
              )}
            </span>
          </div>
          {balance && (
            <div className="mt-1 font-mono text-[9px] text-[var(--ink-faint)]">
              {balance.symbol} on {balance.symbol === "ETH" ? "Ethereum" : "connected chain"}
            </div>
          )}
        </div>

        {/* ENS Card */}
        <div className="rounded border border-[var(--rule-light)] bg-[var(--paper)] p-4">
          <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.3em] text-[var(--ink-faint)]">
            ENS Identity
          </div>
          {ensName ? (
            <div className="flex items-center gap-2">
              {ensAvatar && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={ensAvatar}
                  alt=""
                  className="h-8 w-8 rounded-full border border-[var(--rule-light)] object-cover"
                />
              )}
              <span className="font-mono text-sm font-bold text-[var(--ink)]">
                {ensName}
              </span>
            </div>
          ) : (
            <span className="font-mono text-sm text-[var(--ink-faint)]">
              No ENS name
            </span>
          )}
        </div>
      </div>

      {/* Contract Metadata (placeholder cards) */}
      {isContract && (
        <div>
          <div className="mb-3 font-mono text-[9px] uppercase tracking-[0.3em] text-[var(--ink-faint)]">
            Contract Info
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <MetadataCard label="Type" value="---" />
            <MetadataCard label="Deployer" value="---" />
            <MetadataCard label="Deployed" value="---" />
            <MetadataCard label="Read Fns" value="---" />
            <MetadataCard label="Write Fns" value="---" />
            <MetadataCard label="Source Files" value="---" />
          </div>
          <div className="mt-2 font-mono text-[8px] italic text-[var(--ink-faint)]">
            Contract metadata will be populated from the explorer data layer.
          </div>
        </div>
      )}

      {/* Morality Rating */}
      <div>
        <div className="mb-3 border-b border-[var(--rule)] pb-2 font-mono text-[9px] uppercase tracking-[0.3em] text-[var(--ink-faint)]">
          Morality Rating
        </div>
        <RatingWidget entityHash={entityHash} />
      </div>

      {/* Comment Thread */}
      <div>
        <CommentThread entityHash={entityHash} />
      </div>
    </div>
  );
}

/* ── Small metadata card ── */

function MetadataCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-[var(--rule-light)] bg-[var(--paper)] px-3 py-2">
      <div className="font-mono text-[8px] uppercase tracking-[0.2em] text-[var(--ink-faint)]">
        {label}
      </div>
      <div className="mt-0.5 font-mono text-xs font-bold text-[var(--ink)]">
        {value}
      </div>
    </div>
  );
}
