"use client";

/**
 * Sticky banner shown only on Vercel Preview deployments (dev.pooter.world).
 * Warns users that trading is disabled and points them to production.
 */
export function DevBanner() {
  const isPreview = process.env.NEXT_PUBLIC_VERCEL_ENV === "preview"
    || process.env.RAILWAY_ENVIRONMENT === "staging"
    || (typeof window !== "undefined" && window.location.hostname === "dev.pooter.world");
  if (!isPreview) return null;

  return (
    <div className="sticky top-0 z-[9999] flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-center text-xs font-semibold text-black sm:text-sm">
      <span className="opacity-70">DEV</span>
      <span>
        This is a preview environment. No live trades running.{" "}
        <a
          href="https://pooter.world/markets"
          className="underline decoration-black/40 underline-offset-2 hover:decoration-black"
        >
          See pooter.world for actual trades &rarr;
        </a>
      </span>
    </div>
  );
}
