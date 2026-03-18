"use client";

import { useAccount } from "wagmi";
import { TipButton } from "@/components/entity/TipButton";
import { computeEntityHash, buildEntityUrl } from "@/lib/entity";
import type { Cast } from "@/lib/farcaster";
import Link from "next/link";
import { isAddress } from "viem";

interface CastCardProps {
  cast: Cast;
}

export function CastCard({ cast }: CastCardProps) {
  const { isConnected } = useAccount();

  // Tip the author's verified ETH address, or their Farcaster identity
  const tippableAddress = cast.author.verifiedAddresses?.[0]?.trim() || "";
  const directTipAddress = isAddress(tippableAddress) ? tippableAddress : null;
  const entityHash = tippableAddress
    ? computeEntityHash(tippableAddress)
    : computeEntityHash(`farcaster://${cast.author.username}`);

  const engagement = cast.likes + cast.recasts + cast.replies;
  const isHot = engagement > 50;

  // Try to find an image embed
  const imageEmbed = cast.embeds.find(
    (e) => e.metadata?.image || e.url?.match(/\.(jpg|jpeg|png|gif|webp)/i)
  );
  const imageUrl = imageEmbed?.metadata?.image || imageEmbed?.url;

  return (
    <article
      className={`group rounded-xl border p-4 transition-colors ${
        isHot
          ? "border-[#8A63D2]/30 bg-[#8A63D2]/5 hover:border-[#8A63D2]/50"
          : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
      }`}
    >
      <div className="flex gap-3">
        {/* Author PFP */}
        <img
          src={cast.author.pfpUrl || "https://picsum.photos/seed/fc/40/40"}
          alt={cast.author.username}
          className="h-10 w-10 flex-shrink-0 rounded-full"
          loading="lazy"
        />

        <div className="min-w-0 flex-1">
          {/* Author info */}
          <div className="mb-1 flex items-center gap-2">
            <span className="font-bold text-white" style={{ fontFamily: "'Cooper Black', 'Cooper Std', serif" }}>
              {cast.author.displayName}
            </span>
            <span className="text-xs text-zinc-500">@{cast.author.username}</span>
            <span className="text-[10px] rounded bg-[#8A63D2]/20 px-1.5 py-0.5 font-medium text-[#8A63D2]">
              Farcaster
            </span>
            {cast.channel && (
              <span className="text-[10px] text-zinc-500">/{cast.channel}</span>
            )}
            {isHot && (
              <span className="text-[10px] rounded-full bg-[#D0021B]/10 px-1.5 py-0.5 font-bold text-[#D0021B]">
                HOT
              </span>
            )}
          </div>

          {/* Cast text */}
          <p className="mb-2 whitespace-pre-wrap text-sm leading-relaxed text-zinc-200" style={{ fontFamily: "'Comic Sans MS', 'Comic Neue', cursive" }}>
            {cast.text}
          </p>

          {/* Embed image */}
          {imageUrl && (
            <div className="mb-2 overflow-hidden rounded-lg">
              <img
                src={imageUrl}
                alt=""
                className="max-h-64 w-full object-cover"
                loading="lazy"
              />
            </div>
          )}

          {/* Embed link */}
          {cast.embeds[0]?.metadata?.title && !imageUrl && (
            <a
              href={cast.embeds[0].url}
              target="_blank"
              rel="noopener noreferrer"
              className="mb-2 block rounded-lg border border-zinc-700 bg-zinc-800/50 p-3 transition-colors hover:border-[#2F80ED]"
            >
              <p className="text-sm font-medium text-white">
                {cast.embeds[0].metadata.title}
              </p>
              {cast.embeds[0].metadata.description && (
                <p className="mt-0.5 text-xs text-zinc-400 line-clamp-2">
                  {cast.embeds[0].metadata.description}
                </p>
              )}
            </a>
          )}

          {/* Engagement + actions */}
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
              {cast.likes}
            </span>
            <span className="flex items-center gap-1">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              {cast.recasts}
            </span>
            <span className="flex items-center gap-1">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
              {cast.replies}
            </span>

            <Link
              href={buildEntityUrl(entityHash, { url: tippableAddress || `farcaster://${cast.author.username}`, title: cast.author.displayName, source: "Farcaster", type: "cast" })}
              className="transition-colors hover:text-[#2F80ED]"
            >
              Discuss
            </Link>

            {isConnected && directTipAddress && (
              <TipButton recipientAddress={directTipAddress} />
            )}

            {directTipAddress && (
              <span className="ml-auto font-mono text-[10px] text-zinc-600">
                {directTipAddress.slice(0, 6)}...{directTipAddress.slice(-4)}
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
