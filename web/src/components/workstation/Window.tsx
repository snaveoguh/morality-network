import { ReactNode } from "react";

interface WindowProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  flush?: boolean; // skip padded body wrapper — child controls its own padding
  showCorners?: boolean;
  menuBar?: ReactNode;
  ruler?: boolean;
  footer?: ReactNode;
}

/**
 * Window — a single SunOS/OpenWindows window frame.
 *
 *   ┌─[■]─stripes──Title──stripes─[■]─┐
 *   │  optional subtitle line          │
 *   │  optional menu bar               │
 *   │  optional ruler                  │
 *   │  body                            │
 *   │  optional footer                 │
 *   └──────────────────────────────────┘
 */
export function Window({
  title,
  subtitle,
  children,
  className = "",
  bodyClassName = "",
  flush = false,
  showCorners = true,
  menuBar,
  ruler,
  footer,
}: WindowProps) {
  return (
    <section className={`win ${className}`}>
      <div className="win-titlebar">
        {showCorners && <div className="win-titlebar-corner" aria-hidden />}
        <div className="win-titlebar-text">
          <span>{title}</span>
        </div>
        {showCorners && <div className="win-titlebar-corner right" aria-hidden />}
      </div>
      {subtitle && (
        <div className="win-subtitlebar">
          <span>{subtitle}</span>
        </div>
      )}
      {menuBar}
      {ruler && <Ruler />}
      {flush ? (
        <div className={`win-body-flush ${bodyClassName}`}>{children}</div>
      ) : (
        <div className={`win-body ${bodyClassName}`}>{children}</div>
      )}
      {footer && <div className="fm-footer">{footer}</div>}
    </section>
  );
}

export function Ruler() {
  return (
    <div className="ruler" aria-hidden>
      <div className="ruler-marks">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
          <span key={n}>{n}</span>
        ))}
      </div>
    </div>
  );
}
