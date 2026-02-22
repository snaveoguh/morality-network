"use client";

import { useState, useEffect, useCallback } from "react";

// Lil Nouns VRGDA auction — new noun every 12 seconds
// Price reduces every 15 min, reserve 0.03 ETH
// We show a live-ish view of the current noun on sale

interface AuctionData {
  nounId: number;
  imageUrl: string;
  currentPrice: string;
  reservePrice: string;
}

export function LilNounsAuction() {
  const [secondsLeft, setSecondsLeft] = useState(12);
  const [nounSeed, setNounSeed] = useState(() => Math.floor(Math.random() * 10000));

  // Countdown timer — every 12 seconds a new Lil Noun is available
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          setNounSeed((s) => s + 1);
          return 12;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Generate a deterministic noun image URL from the seed
  // Using the Nouns on-chain SVG renderer via cloudflare worker
  const nounImageUrl = `https://noun.pics/${nounSeed % 3000}`;

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">⌐◨-◨</span>
          <span className="text-sm font-semibold text-white">Lil Nouns</span>
        </div>
        <a
          href="https://lilnouns.auction"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-[#2F80ED] hover:underline"
        >
          lilnouns.auction &rarr;
        </a>
      </div>

      {/* Noun preview */}
      <div className="flex items-center gap-4 p-4">
        {/* Noun image */}
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-[#d5d7e1]">
          <img
            src={nounImageUrl}
            alt={`Lil Noun #${nounSeed}`}
            className="h-full w-full object-cover"
            loading="lazy"
          />
          {/* Pulse ring on countdown */}
          <div
            className="absolute inset-0 rounded-lg border-2 border-[#31F387] opacity-0 transition-opacity"
            style={{ opacity: secondsLeft <= 3 ? 0.6 : 0 }}
          />
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1">
          <p className="text-xs text-zinc-500">Currently available</p>
          <p className="text-lg font-bold text-white">
            Lil Noun #{nounSeed}
          </p>

          {/* Timer bar */}
          <div className="mt-2 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-[#31F387] transition-all duration-1000"
                style={{ width: `${(secondsLeft / 12) * 100}%` }}
              />
            </div>
            <span className="text-xs font-mono tabular-nums text-zinc-400">
              {secondsLeft}s
            </span>
          </div>

          <p className="mt-1 text-[10px] text-zinc-600">
            New noun every 12s &middot; VRGDA pricing &middot; Reserve 0.03 ETH
          </p>
        </div>
      </div>

      {/* Live stats strip */}
      <div className="flex border-t border-zinc-800 text-center text-[10px]">
        <div className="flex-1 border-r border-zinc-800 py-2">
          <p className="text-zinc-500">Cadence</p>
          <p className="font-medium text-white">12s</p>
        </div>
        <div className="flex-1 border-r border-zinc-800 py-2">
          <p className="text-zinc-500">Reserve</p>
          <p className="font-medium text-white">0.03 ETH</p>
        </div>
        <div className="flex-1 py-2">
          <p className="text-zinc-500">Governance</p>
          <p className="font-medium text-[#2F80ED]">
            <a href="https://snapshot.org/#/leagueoflils.eth" target="_blank" rel="noopener noreferrer">
              Snapshot
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
