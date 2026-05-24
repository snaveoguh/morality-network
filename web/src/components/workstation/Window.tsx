/**
 * Window — striped title bar, 1px border, content area.
 * The newspaper document lives inside this — FrameMaker 1.0 holding
 * today's edition.
 */
import { ReactNode } from "react";

export interface WindowProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** show the document ruler above the body */
  ruler?: boolean;
  /** allow the body background to bleed through (keeps cream paper) */
  transparentBody?: boolean;
  className?: string;
}

export function Window({
  title,
  subtitle,
  children,
  ruler = false,
  transparentBody = false,
  className = "",
}: WindowProps) {
  return (
    <div className={`win ${className}`}>
      <div className="win-titlebar">
        <div className="win-titlebar-text">
          <span className="win-titlebar-btn win-titlebar-btn--close" aria-hidden />
          <span>{title}</span>
          {subtitle ? (
            <span className="text-[9px] font-normal opacity-60">{subtitle}</span>
          ) : null}
        </div>
      </div>
      {ruler ? <DocumentRuler /> : null}
      <div
        className="win-body"
        style={transparentBody ? { background: "transparent" } : undefined}
      >
        {children}
      </div>
    </div>
  );
}

function DocumentRuler() {
  // 8 inch marks — FrameMaker default Letter
  const inches = [0, 1, 2, 3, 4, 5, 6, 7];
  return (
    <div className="ruler" aria-hidden>
      {inches.map((i) => (
        <div key={i} className="ruler-tick-major">
          {i === 0 ? "" : i}
        </div>
      ))}
    </div>
  );
}
