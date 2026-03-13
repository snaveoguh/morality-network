// ============================================================================
// FEED SKELETON — lofi newspaper grid placeholder while feed data streams in
//
// Mimics the real newspaper-grid layout with pulsing bars for headlines,
// body text, and source labels. Feels like newsprint loading.
// ============================================================================

function SkeletonCell({
  span,
  lines = 3,
  hasImage = false,
}: {
  span: string;
  lines?: number;
  hasImage?: boolean;
}) {
  return (
    <div className={`newspaper-cell ${span}`}>
      {hasImage && (
        <div className="mb-3 h-32 w-full animate-pulse bg-[var(--rule-light)]/40 sm:h-44" />
      )}
      {/* Source label */}
      <div className="mb-2 h-2 w-16 animate-pulse bg-[var(--rule-light)]/50" />
      {/* Headline */}
      <div className="mb-1 h-4 w-11/12 animate-pulse bg-[var(--rule-light)]" />
      <div className="mb-3 h-4 w-3/4 animate-pulse bg-[var(--rule-light)]" />
      {/* Body lines */}
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="mb-1 h-2.5 animate-pulse bg-[var(--rule-light)]/40"
          style={{ width: `${85 - i * 8}%` }}
        />
      ))}
    </div>
  );
}

export function FeedSkeleton() {
  return (
    <div className="newspaper-grid">
      {/* Hero tile */}
      <SkeletonCell span="newspaper-hero" lines={4} hasImage />

      {/* Double rule */}
      <hr className="newspaper-double-rule" />

      {/* Major tiles */}
      <SkeletonCell span="newspaper-major" lines={3} hasImage />
      <SkeletonCell span="newspaper-major" lines={3} />

      {/* Rule */}
      <hr className="newspaper-rule" />

      {/* Standard tiles */}
      <SkeletonCell span="newspaper-standard" lines={2} />
      <SkeletonCell span="newspaper-standard" lines={2} />
      <SkeletonCell span="newspaper-standard" lines={2} />

      {/* Rule */}
      <hr className="newspaper-rule" />

      {/* Minor tiles */}
      <SkeletonCell span="newspaper-minor" lines={1} />
      <SkeletonCell span="newspaper-minor" lines={1} />
      <SkeletonCell span="newspaper-minor" lines={1} />

      {/* Filler */}
      <SkeletonCell span="newspaper-filler" lines={0} />
      <SkeletonCell span="newspaper-filler" lines={0} />
      <SkeletonCell span="newspaper-filler" lines={0} />
    </div>
  );
}
