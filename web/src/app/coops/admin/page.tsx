import { withBrand } from "@/lib/brand";
import { PipelineAdmin } from "@/components/coops/PipelineAdmin";

export const metadata = {
  title: withBrand("Co-op tracker review"),
  robots: { index: false, follow: false },
};

export default function CoopsAdminPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:py-10">
      <h1 className="font-headline text-3xl text-[var(--ink)]">Co-op tracker review</h1>
      <p className="mt-2 text-[15px] text-[var(--ink-light)]">
        Check each submission before publishing it. Every change to a stage or figure is added to the co-op&apos;s public
        history.
      </p>
      <div className="mt-6">
        <PipelineAdmin />
      </div>
    </div>
  );
}
