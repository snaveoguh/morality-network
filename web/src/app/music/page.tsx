import type { Metadata } from "next";
import { withBrand } from "@/lib/brand";
import { MusicPlayer } from "./MusicPlayer";

export const metadata: Metadata = {
  title: withBrand("Music"),
  description: "Taste-aware music discovery. Searches all of YouTube. Like what you hear, skip what you don't.",
};

export default function MusicPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <header className="mb-8 border-b border-[var(--rule)] pb-6">
        <p className="mb-1 font-mono text-[9px] uppercase tracking-[0.24em] text-[var(--ink-faint)]">
          Music &middot; Discovery
        </p>
        <h1 className="font-headline text-4xl text-[var(--ink)] sm:text-5xl">
          The Underground
        </h1>
        <p className="mt-3 max-w-xl font-body-serif text-base leading-relaxed text-[var(--ink-light)]">
          Pulls from everywhere. Gets smarter as you like and skip.
          Hit shuffle for a fresh batch.
        </p>
      </header>

      <MusicPlayer />
    </main>
  );
}
