"use client";

import Link from "next/link";
import { useReadContract } from "wagmi";
import { mainnet } from "viem/chains";
import type { NounMarketItem } from "@/lib/nouns-marketplace";
import { NOUNS_CONTRACT, NOUNS_TOKEN_ABI } from "@/lib/nouns-marketplace";
import { buildNounSvg, type NounSeed } from "@/lib/nouns-svg";
import { NounsBuyButton } from "./NounsBuyButton";

export function NounCard({ noun }: { noun: NounMarketItem }) {
  // Fetch seed from the NounsToken contract
  const { data: seedData } = useReadContract({
    address: NOUNS_CONTRACT,
    abi: NOUNS_TOKEN_ABI,
    functionName: "seeds",
    args: [BigInt(noun.nounId)],
    chainId: mainnet.id,
  });

  const seed: NounSeed | null = seedData
    ? {
        background: Number(seedData[0]),
        body: Number(seedData[1]),
        accessory: Number(seedData[2]),
        head: Number(seedData[3]),
        glasses: Number(seedData[4]),
      }
    : null;

  const svgHtml = seed ? buildNounSvg(seed) : null;

  return (
    <article className="group flex flex-col border border-[var(--rule-light)] bg-[var(--paper)] transition-colors hover:border-[var(--rule)]">
      {/* Noun image */}
      <Link href={`/nouns/${noun.nounId}`} className="block">
        <div className="relative aspect-square overflow-hidden bg-[var(--paper-dark)]">
          {svgHtml ? (
            <div
              className="h-full w-full [image-rendering:pixelated] transition-transform duration-300 group-hover:scale-[1.03] [&_svg]:block [&_svg]:h-full [&_svg]:w-full"
              dangerouslySetInnerHTML={{ __html: svgHtml }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center font-headline text-3xl text-[var(--ink-faint)]">
              {noun.nounId}
            </div>
          )}

          {/* Listed price overlay */}
          {noun.listedPriceEth && (
            <span className="absolute bottom-2 right-2 bg-[var(--ink)] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[var(--paper)]">
              {parseFloat(noun.listedPriceEth).toFixed(4)} ETH
            </span>
          )}
        </div>
      </Link>

      {/* Info */}
      <div className="flex flex-1 flex-col p-3">
        <Link href={`/nouns/${noun.nounId}`}>
          <h3 className="font-headline text-sm leading-snug text-[var(--ink)] transition-colors hover:text-[var(--accent-red)]">
            Noun {noun.nounId}
          </h3>
        </Link>

        {noun.owner && (
          <p className="mt-0.5 font-mono text-[8px] text-[var(--ink-faint)] truncate">
            Owner: {noun.owner.slice(0, 6)}...{noun.owner.slice(-4)}
          </p>
        )}

        {/* Actions */}
        <div className="mt-auto flex items-center gap-2 border-t border-[var(--rule-light)] pt-2 mt-2">
          {noun.listedPriceEth && noun.orderHash ? (
            <NounsBuyButton
              orderHash={noun.orderHash}
              priceEth={noun.listedPriceEth}
            />
          ) : (
            <Link
              href={`/nouns/${noun.nounId}`}
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
