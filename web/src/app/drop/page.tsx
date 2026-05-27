import type { Metadata } from "next";
import { getDailyEdition } from "@/lib/daily-edition";
import { MemoTeeDesign } from "@/components/drop/MemoTeeDesign";
import { Countdown } from "./Countdown";

export const metadata: Metadata = {
  title: "Drop · pooter world",
  description:
    "Daily limited edition. 15 units. The editorial agent designs.",
};

export const revalidate = 60;

const UNITS_TOTAL = 15;
const UNITS_SOLD = 0;
const PRICE_USD = 44;

export default async function DropPage() {
  const daily = await getDailyEdition().catch(() => null);

  const headline =
    daily?.headline?.trim() ||
    "THE FIRST AGENT BECAME PROFITABLE ON THE DAY THE POPE DECLARED A HOLY WAR ON AI";

  const now = new Date();
  const dropNumber = Math.max(
    1,
    Math.floor(
      (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
        Date.UTC(2026, 4, 26)) /
        86_400_000
    ) + 1
  );
  const docNumber = `PW-${String(dropNumber).padStart(4, "0")}-A`;

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
      {/* Top meta */}
      <div className="mb-3 flex items-center justify-between font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-faint)]">
        <span>POOTER DROP №{String(dropNumber).padStart(3, "0")}</span>
        <span>
          {now.toLocaleDateString("en-GB", {
            weekday: "short",
            day: "numeric",
            month: "short",
            year: "numeric",
          }).toUpperCase()}
        </span>
      </div>

      {/* Countdown */}
      <div className="border-y border-[var(--rule-light)] py-6 text-center">
        <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.3em] text-[var(--ink-faint)]">
          Next drop in
        </div>
        <Countdown />
        <div className="mt-3 font-mono text-[9px] uppercase tracking-[0.24em] text-[var(--ink-faint)]">
          New memo, new design. 00:00 UTC daily.
        </div>
      </div>

      {/* Tee design */}
      <div className="my-10">
        <MemoTeeDesign headline={headline} docNumber={docNumber} />
      </div>

      {/* Sold counter */}
      <div className="mb-6 flex items-baseline justify-between border-t border-[var(--rule-light)] pt-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-[var(--ink-faint)]">
          Sold
        </div>
        <div className="font-headline text-3xl text-[var(--ink)]">
          {String(UNITS_SOLD).padStart(2, "0")}
          <span className="text-[var(--ink-faint)] mx-1">/</span>
          {UNITS_TOTAL}
        </div>
      </div>

      {/* Buy */}
      <button
        type="button"
        disabled
        className="block w-full border border-[var(--ink)] bg-[var(--ink)] px-6 py-4 font-headline text-2xl text-[var(--paper)] transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50 sm:text-3xl"
      >
        Take one — ${PRICE_USD} USD
      </button>
      <div className="mt-2 text-center font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--ink-faint)]">
        Checkout not yet wired. Drop opens when printful pipeline lands.
      </div>

      {/* Spec / FAQ */}
      <div className="mt-12 grid grid-cols-1 gap-6 border-t border-[var(--rule-light)] pt-8 sm:grid-cols-2">
        <div>
          <h3 className="font-headline text-lg text-[var(--ink)]">Spec</h3>
          <ul className="mt-2 space-y-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[var(--ink-light)]">
            <li>Comfort Colors 1717</li>
            <li>100% ringspun cotton, 6.1oz</li>
            <li>Heavyweight, garment-dyed</li>
            <li>Front print, screen, white ink on graphite</li>
            <li>Shipped from US — 5–10 day fulfillment</li>
          </ul>
        </div>
        <div>
          <h3 className="font-headline text-lg text-[var(--ink)]">What is this</h3>
          <p className="mt-2 font-body-serif text-sm leading-relaxed text-[var(--ink-light)]">
            Every day at 00:00 UTC the pooter editorial agent publishes a memo.
            One headline gets printed onto 15 heavyweight tees. When the run
            sells out, it&apos;s gone. Tomorrow there&apos;s a new memo.
          </p>
        </div>
      </div>
    </div>
  );
}
