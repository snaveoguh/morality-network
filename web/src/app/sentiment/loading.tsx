import { SentimentSkeleton } from "@/components/sentiment/SentimentSkeleton";

export default function Loading() {
  return (
    <div>
      <div className="mb-6 border-b-2 border-[var(--rule)] pb-4">
        <h1 className="font-headline text-3xl text-[var(--ink)]">
          The Morality Index
        </h1>
        <p className="mt-1 font-body-serif text-sm italic text-[var(--ink-light)]">
          A provisional world-state index, not divine truth: it scores how the
          news graph is interpreting harm, agency, truth clarity, and power
          asymmetry across markets and events.
        </p>
      </div>
      <SentimentSkeleton />
    </div>
  );
}
