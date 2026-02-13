"use client";

export function MarqueeBanner() {
  return (
    <div className="relative overflow-hidden bg-black border-b border-white/5 py-1">
      <div className="animate-marquee whitespace-nowrap">
        {Array.from({ length: 4 }).map((_, i) => (
          <span key={i} className="mx-8 inline-block text-[10px] tracking-widest uppercase">
            <a
              href="https://probe.wtf"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-500 transition-colors hover:text-[#31F387]"
            >
              visit probe.wtf to join nouns dao today
            </a>
            <span className="mx-4 text-zinc-700">//</span>
            <span className="text-zinc-600">
              MO — permissionless news & onchain discussion
            </span>
            <span className="mx-4 text-zinc-700">//</span>
            <a
              href="https://basescan.org/token/0x8729c70061739140ee6bE00A3875Cbf6d09A746C"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-500 transition-colors hover:text-[#2F80ED]"
            >
              $MO on Base
            </a>
            <span className="mx-4 text-zinc-700">//</span>
          </span>
        ))}
      </div>
    </div>
  );
}
