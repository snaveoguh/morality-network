"use client";

import Link from "next/link";
import type { PepeFeedItem } from "@/lib/pepe";
import { getRarityLabel } from "@/lib/pepe";
import { BuyButton } from "./BuyButton";

export function PepeCard({ pepe }: { pepe: PepeFeedItem }) {
  const rarity = getRarityLabel(pepe.supply);
  const displayName = pepe.asset.replace(/([A-Z])/g, " $1").trim();

  return (
    <article className="group flex flex-col border border-[var(--rule-light)] bg-[var(--paper)] transition-colors hover:border-[var(--rule)]">
      {/* Card image — full color, no grayscale */}
      <Link href={`/pepe/${pepe.asset}`} className="block">
        <div className="relative aspect-square overflow-hidden bg-[var(--paper-dark)]">
          {pepe.imageUrl ? (
            <img
              src={pepe.imageUrl}
              alt={pepe.asset}
              className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.03]"
              loading="lazy"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-headline text-2xl text-[var(--ink-faint)]">
              ?
            </div>
          )}

          {/* Rarity badge */}
          {pepe.supply > 0 && (
            <span className={`absolute top-2 left-2 px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wider ${
              rarity === "Legendary"
                ? "bg-[var(--ink)] text-[var(--paper)]"
                : rarity === "Rare"
                  ? "border border-[var(--ink)] bg-[var(--paper)] text-[var(--ink)]"
                  : "bg-[var(--paper)] text-[var(--ink-faint)] border border-[var(--rule-light)]"
            }`}>
              {rarity}
            </span>
          )}

          {/* Listed price overlay */}
          {pepe.listedPriceEth && (
            <span className="absolute bottom-2 right-2 bg-[var(--ink)] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[var(--paper)]">
              {parseFloat(pepe.listedPriceEth).toFixed(4)} ETH
            </span>
          )}
        </div>
      </Link>

      {/* Info */}
      <div className="flex flex-1 flex-col p-3">
        {/* Series/card meta */}
        <div className="mb-1 flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
          <span>Series {pepe.series}</span>
          <span>&middot;</span>
          <span>#{pepe.card}</span>
          {pepe.supply > 0 && (
            <>
              <span>&middot;</span>
              <span>{pepe.supply} issued</span>
            </>
          )}
        </div>

        {/* Name */}
        <Link href={`/pepe/${pepe.asset}`}>
          <h3 className="font-headline text-sm leading-snug text-[var(--ink)] transition-colors hover:text-[var(--accent-red)] line-clamp-1">
            {displayName}
          </h3>
        </Link>

        {/* Estimated value */}
        {pepe.estimatedValueUsd && !pepe.listedPriceEth && (
          <p className="mt-0.5 font-mono text-[8px] text-[var(--ink-faint)]">
            Est. ~${pepe.estimatedValueUsd}
          </p>
        )}

        {/* Actions */}
        <div className="mt-auto flex items-center gap-2 border-t border-[var(--rule-light)] pt-2 mt-2">
          {pepe.listedPriceEth && pepe.orderHash ? (
            <BuyButton
              orderHash={pepe.orderHash}
              priceEth={pepe.listedPriceEth}
            />
          ) : pepe.marketplaceUrl ? (
            <a
              href={pepe.marketplaceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
            >
              View on OpenSea &rsaquo;
            </a>
          ) : (
            <Link
              href={`/pepe/${pepe.asset}`}
              className="font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
            >
              View Details
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
