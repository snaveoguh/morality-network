import Link from "next/link";
import { withBrand } from "@/lib/brand";
import { listAreas } from "@/lib/coops/economy";
import { StartFlowLoader } from "@/components/coops/StartFlowLoader";

export const metadata = {
  title: withBrand("Start a co-op"),
  description:
    "Work out what kind of co-op you are starting, get a step-by-step plan and founding meeting agenda, and join the public co-op tracker.",
};

export default function StartCoopPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-10">
      <header className="mb-8">
        <p className="text-sm text-[var(--ink-faint)] print:hidden">
          <Link href="/coops" className="hover:underline">Co-op tracker</Link>
        </p>
        <h1 className="mt-2 font-headline text-4xl text-[var(--ink)] sm:text-5xl">Start a co-op</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[var(--ink-light)]">
          Five short steps. You get a plan for your kind of co-op, a founding meeting agenda and the questions to take
          to an adviser. Your answers stay in this browser until you choose to join the tracker.
        </p>
      </header>
      <StartFlowLoader areas={listAreas()} />
    </div>
  );
}
