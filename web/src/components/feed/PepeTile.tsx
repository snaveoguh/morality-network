"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { computeEntityHash, buildEntityUrl } from "@/lib/entity";
import { TipButton } from "@/components/entity/TipButton";
import type { PepeFeedItem } from "@/lib/pepe";
import { getRarityLabel } from "@/lib/pepe";

type VisualWeight = "hero" | "major" | "standard" | "minor" | "filler";

const HEADLINE_SIZES: Record<VisualWeight, string> = {
  hero: "text-3xl sm:text-4xl lg:text-5xl leading-[1.05] font-headline",
  major: "text-xl sm:text-2xl leading-tight font-headline",
  standard: "text-base leading-snug font-headline",
  minor: "text-sm leading-snug font-headline-serif font-bold",
  filler: "text-xs leading-snug font-headline-serif font-semibold",
};

export function PepeTile({ pepe, weight }: { pepe: PepeFeedItem; weight: VisualWeight }) {
  const { isConnected } = useAccount();
  const [imgFailed, setImgFailed] = useState(false);
  const entityHash = computeEntityHash(`pepe://${pepe.asset}`);
  const rarity = getRarityLabel(pepe.supply);
  const isHero = weight === "hero";
  const displayName = pepe.asset.replace(/([A-Z])/g, " $1").trim();
  const onImgError = useCallback(() => setImgFailed(true), []);

  return (
    <article className="relative flex h-full flex-col">
      {/* Card image — blasted B&W contrast */}
      {pepe.imageUrl && (
        <Link href={`/pepe/${pepe.asset}`} className="block">
          <div className={`newspaper-img-hero mb-3 overflow-hidden bg-[var(--paper-dark)] ${isHero ? "" : weight === "major" ? "h-44" : "h-32"}`}
               style={isHero ? { height: "clamp(280px, 40vw, 480px)" } : undefined}>
            {imgFailed ? (
              <div className="flex h-full w-full items-center justify-center bg-[var(--paper-dark)]">
                <span className="font-headline text-lg text-[var(--ink-faint)] opacity-40">{pepe.asset}</span>
              </div>
            ) : (
              <img
                src={pepe.imageUrl}
                alt={pepe.asset}
                className="h-full w-full object-contain"
                style={{ filter: "grayscale(100%) contrast(2) brightness(1.1)", mixBlendMode: "multiply" }}
                loading={isHero ? "eager" : "lazy"}
                onError={onImgError}
              />
            )}
          </div>
        </Link>
      )}

      {/* Dateline */}
      <div className="mb-1 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
        <span className="font-bold text-[var(--ink-light)]">Rare Pepe</span>
        <span>&middot;</span>
        <span>Series {pepe.series}</span>
        {pepe.supply > 0 && (
          <>
            <span>&middot;</span>
            <span className={rarity === "Legendary" ? "font-bold text-[var(--ink)]" : ""}>
              {rarity}
            </span>
          </>
        )}
        {pepe.listedPriceEth && (
          <span className="ml-auto font-bold text-[var(--ink)]">
            {parseFloat(pepe.listedPriceEth).toFixed(4)} ETH
          </span>
        )}
        {!pepe.listedPriceEth && pepe.estimatedValueUsd && (
          <span className="ml-auto">~${pepe.estimatedValueUsd}</span>
        )}
      </div>

      {/* Headline */}
      <Link href={`/pepe/${pepe.asset}`}>
        <h3 className={`${HEADLINE_SIZES[weight]} text-[var(--ink)] transition-colors hover:text-[var(--accent-red)] line-clamp-2`}>
          {displayName}
        </h3>
      </Link>

      {/* Supply info */}
      {pepe.supply > 0 && (
        <p className="mt-1 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
          {pepe.supply} issued &middot; Card #{pepe.card}
        </p>
      )}

      {/* Footer */}
      <div className="mt-auto flex items-center gap-3 border-t border-[var(--rule-light)] pt-2 mt-3 font-mono text-[9px] uppercase tracking-wider text-[var(--ink-faint)]">
        <Link
          href={`/pepe/${pepe.asset}`}
          className="font-bold text-[var(--ink-light)] transition-colors hover:text-[var(--ink)]"
        >
          {pepe.listedPriceEth ? "Buy" : "View"}
        </Link>
        {pepe.marketplaceUrl && (
          <a
            href={pepe.marketplaceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-[var(--ink)]"
          >
            OpenSea&nbsp;&rsaquo;
          </a>
        )}
        <Link
          href={buildEntityUrl(entityHash, { url: `pepe://${pepe.asset}`, title: displayName, source: "Rare Pepe", type: "pepe" })}
          className="transition-colors hover:text-[var(--ink)]"
        >
          Discuss
        </Link>
        {isConnected && <TipButton entityHash={entityHash} />}
      </div>
    </article>
  );
}
