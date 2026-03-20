"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { computeEntityHash, buildEntityUrl } from "@/lib/entity";
import { TipButton } from "@/components/entity/TipButton";
import type { PepeAssetDetail } from "@/lib/pepe";
import { getRarityLabel } from "@/lib/pepe";
import { BuyButton } from "./BuyButton";
import { ListButton } from "./ListButton";

export function PepeDetailView({ asset }: { asset: string }) {
  const { isConnected, address } = useAccount();
  const [detail, setDetail] = useState<PepeAssetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const entityHash = computeEntityHash(`pepe://${asset}`);

  useEffect(() => {
    fetch(`/api/pepe/${asset}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setDetail(null);
        else setDetail(data);
      })
      .catch(() => setDetail(null))
      .finally(() => setLoading(false));
  }, [asset]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <span className="font-mono text-sm uppercase tracking-wider text-[var(--ink-faint)]">
          Loading {asset}...
        </span>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="py-24 text-center">
        <h1 className="font-headline text-3xl text-[var(--ink)]">{asset}</h1>
        <p className="mt-2 font-body-serif text-sm text-[var(--ink-faint)]">
          Could not load card data from XChain.
        </p>
        <Link
          href="/pepe"
          className="mt-4 inline-block font-mono text-[10px] uppercase tracking-wider text-[var(--ink-light)] transition-colors hover:text-[var(--ink)]"
        >
          &larr; Back to Exchange
        </Link>
      </div>
    );
  }

  const rarity = getRarityLabel(detail.supply);
  const displayName = detail.asset.replace(/([A-Z])/g, " $1").trim();
  const isOwner = detail.owner && address && detail.owner.toLowerCase() === address.toLowerCase();

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="mb-4 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
        <Link href="/pepe" className="transition-colors hover:text-[var(--ink)]">
          Rare Pepe Exchange
        </Link>
        <span className="mx-1.5">/</span>
        <span className="text-[var(--ink)]">{asset}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Card image — full color */}
        <div className="flex items-start justify-center">
          <div className="w-full max-w-md overflow-hidden border border-[var(--rule-light)] bg-[var(--paper-dark)]">
            <img
              src={detail.imageUrl}
              alt={asset}
              className="h-auto w-full object-contain"
            />
          </div>
        </div>

        {/* Details */}
        <div>
          {/* Series / Card */}
          <div className="mb-2 flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
            <span>Series {detail.series}</span>
            <span>&middot;</span>
            <span>Card #{detail.card}</span>
            <span>&middot;</span>
            <span className={rarity === "Legendary" ? "font-bold text-[var(--ink)]" : ""}>
              {rarity}
            </span>
          </div>

          {/* Title */}
          <h1 className="font-headline text-4xl text-[var(--ink)]">{displayName}</h1>

          {/* Supply + locked */}
          <div className="mt-3 space-y-1 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-light)]">
            <p>{detail.supply} issued {detail.locked && "(supply locked)"}</p>
            {detail.holderCount !== null && <p>{detail.holderCount} holders</p>}
            {detail.issuer && (
              <p className="truncate">
                Issuer: <span className="text-[var(--ink-faint)]">{detail.issuer}</span>
              </p>
            )}
          </div>

          {/* Price / Buy */}
          <div className="mt-6 border-t border-b border-[var(--rule)] py-4">
            {detail.listedPriceEth ? (
              <div className="flex items-center gap-4">
                <div>
                  <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                    Listed Price
                  </p>
                  <p className="font-mono text-2xl font-bold text-[var(--ink)]">
                    {parseFloat(detail.listedPriceEth).toFixed(4)} ETH
                  </p>
                </div>
                {detail.orderHash && (
                  <BuyButton
                    orderHash={detail.orderHash}
                    priceEth={detail.listedPriceEth}
                  />
                )}
              </div>
            ) : detail.estimatedValueUsd ? (
              <div>
                <p className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
                  Estimated Value
                </p>
                <p className="font-mono text-xl text-[var(--ink-light)]">
                  ~${detail.estimatedValueUsd}
                </p>
                <p className="mt-1 font-mono text-[8px] text-[var(--ink-faint)]">
                  No active Emblem Vault listing
                </p>
              </div>
            ) : (
              <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
                No active listing
              </p>
            )}
          </div>

          {/* List for sale (if owner) */}
          {isOwner && detail.emblemTokenId && detail.emblemContract && (
            <div className="mt-3">
              <ListButton tokenId={detail.emblemTokenId} contract={detail.emblemContract} />
            </div>
          )}

          {/* Dispensers */}
          {detail.dispensers.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]">
                Active Dispensers (Counterparty)
              </h3>
              <div className="space-y-1">
                {detail.dispensers.map((d, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between border border-[var(--rule-light)] px-2 py-1 font-mono text-[9px] text-[var(--ink-light)]"
                  >
                    <span className="truncate">{d.source}</span>
                    <span className="shrink-0 ml-2">
                      {(d.satoshirate / 100_000_000).toFixed(8)} BTC &middot; {d.escrowQuantity} left
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-1 font-mono text-[8px] text-[var(--ink-faint)]">
                Dispensers are native Counterparty DEX listings (requires BTC wallet)
              </p>
            </div>
          )}

          {/* Links */}
          <div className="mt-6 flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-wider text-[var(--ink-faint)]">
            {detail.marketplaceUrl && (
              <a
                href={detail.marketplaceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-[var(--ink)]"
              >
                OpenSea &rsaquo;
              </a>
            )}
            <a
              href={`https://xchain.io/asset/${asset}`}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-[var(--ink)]"
            >
              XChain &rsaquo;
            </a>
            <a
              href={`https://pepe.wtf/asset/${asset}`}
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-[var(--ink)]"
            >
              pepe.wtf &rsaquo;
            </a>
            <Link
              href={buildEntityUrl(entityHash, { url: `pepe://${asset}`, title: displayName, source: "Rare Pepe", type: "pepe" })}
              className="transition-colors hover:text-[var(--ink)]"
            >
              Discuss
            </Link>
            {isConnected && <TipButton entityHash={entityHash} />}
          </div>
        </div>
      </div>
    </div>
  );
}
