import { Suspense } from "react";
import { RoomList } from "@/components/discuss/RoomList";
import { withBrand } from "@/lib/brand";

export const revalidate = 30;

export const metadata = {
  title: withBrand("Discussion Rooms"),
  description:
    "Live onchain discussion rooms. Every message is permanent, every voice is heard.",
};

export default function DiscussPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 border-b-2 border-[var(--rule)] pb-4">
        <h1 className="font-headline text-2xl font-bold text-[var(--ink)]">
          Discussion Rooms
        </h1>
        <p className="mt-1 font-body-serif text-sm text-[var(--ink-light)]">
          Live onchain conversations. Every message is stored permanently on
          Base.
        </p>
        <div className="mt-2 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
          Base Mainnet &bull; All messages are public and immutable
        </div>
      </div>

      <section>
        <h2 className="mb-3 font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-[var(--ink)]">
          Active Rooms
        </h2>
        <Suspense
          fallback={
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="border border-[var(--rule-light)] p-3">
                  <div className="h-4 w-48 animate-pulse bg-[var(--rule-light)]" />
                  <div className="mt-1 h-3 w-32 animate-pulse bg-[var(--rule-light)]" />
                </div>
              ))}
            </div>
          }
        >
          <RoomList />
        </Suspense>
      </section>
    </main>
  );
}
