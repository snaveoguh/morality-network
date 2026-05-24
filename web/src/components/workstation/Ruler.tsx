/**
 * Ruler — horizontal FrameMaker-style ruler with inch tick marks.
 * Pure presentational. Used above the document window for the
 * "open document in FrameMaker" feel.
 */
export interface RulerProps {
  /** number of major inch ticks (default 8) */
  marks?: number;
}

export function Ruler({ marks = 8 }: RulerProps) {
  return (
    <div className="ruler" aria-hidden>
      {Array.from({ length: marks }, (_, i) => (
        <div key={i} className="ruler-tick-major">
          {i === 0 ? "" : i}
        </div>
      ))}
    </div>
  );
}
