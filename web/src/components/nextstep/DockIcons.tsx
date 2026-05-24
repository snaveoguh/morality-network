"use client";

import type { ReactNode } from "react";

/**
 * Chunky bitmap-style SVG icons rendered at 32x32 with crispEdges.
 * One-bit feel — black strokes on white, faint shading via grays.
 */

type IconProps = {
  size?: number;
  className?: string;
};

const wrap = (children: ReactNode, size: number, className: string) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    shapeRendering="crispEdges"
    className={className}
    aria-hidden
  >
    {children}
  </svg>
);

/** Feed — newspaper page with lines */
export function FeedIcon({ size = 32, className = "" }: IconProps) {
  return wrap(
    <>
      <rect x="6" y="3" width="20" height="26" fill="#FFF" stroke="#000" />
      <rect x="9" y="6" width="14" height="4" fill="#000" />
      <rect x="9" y="12" width="14" height="1" fill="#000" />
      <rect x="9" y="14" width="14" height="1" fill="#000" />
      <rect x="9" y="16" width="14" height="1" fill="#000" />
      <rect x="9" y="18" width="10" height="1" fill="#000" />
      <rect x="9" y="21" width="14" height="1" fill="#000" />
      <rect x="9" y="23" width="14" height="1" fill="#000" />
      <rect x="9" y="25" width="8" height="1" fill="#000" />
    </>,
    size,
    className,
  );
}

/** Markets — vertical bar chart */
export function MarketsIcon({ size = 32, className = "" }: IconProps) {
  return wrap(
    <>
      <rect x="3" y="3" width="26" height="26" fill="#FFF" stroke="#000" />
      <rect x="6" y="20" width="3" height="6" fill="#000" />
      <rect x="11" y="14" width="3" height="12" fill="#000" />
      <rect x="16" y="9" width="3" height="17" fill="#000" />
      <rect x="21" y="17" width="3" height="9" fill="#000" />
      <rect x="6" y="26" width="20" height="1" fill="#000" />
    </>,
    size,
    className,
  );
}

/** Predictions — coin flip / question */
export function PredictionsIcon({ size = 32, className = "" }: IconProps) {
  return wrap(
    <>
      <circle cx="16" cy="16" r="12" fill="#FFF" stroke="#000" strokeWidth="1" />
      <rect x="14" y="8" width="4" height="3" fill="#000" />
      <rect x="14" y="13" width="4" height="2" fill="#000" />
      <rect x="14" y="17" width="4" height="2" fill="#000" />
      <rect x="14" y="22" width="4" height="2" fill="#000" />
    </>,
    size,
    className,
  );
}

/** Leaderboard — trophy / podium */
export function LeaderboardIcon({ size = 32, className = "" }: IconProps) {
  return wrap(
    <>
      <rect x="3" y="3" width="26" height="26" fill="#FFF" stroke="#000" />
      <rect x="12" y="11" width="8" height="11" fill="#000" />
      <rect x="6" y="15" width="6" height="7" fill="#000" />
      <rect x="20" y="18" width="6" height="4" fill="#000" />
      <rect x="6" y="22" width="20" height="1" fill="#000" />
    </>,
    size,
    className,
  );
}

/** Discuss — chat bubbles */
export function DiscussIcon({ size = 32, className = "" }: IconProps) {
  return wrap(
    <>
      <rect x="3" y="5" width="20" height="14" fill="#FFF" stroke="#000" />
      <rect x="7" y="10" width="12" height="1" fill="#000" />
      <rect x="7" y="13" width="10" height="1" fill="#000" />
      <rect x="9" y="19" width="4" height="3" fill="#FFF" stroke="#000" />
      <rect x="11" y="13" width="18" height="12" fill="#FFF" stroke="#000" />
      <rect x="14" y="17" width="12" height="1" fill="#000" />
      <rect x="14" y="20" width="9" height="1" fill="#000" />
    </>,
    size,
    className,
  );
}

/** Write/Submit — pencil */
export function WriteIcon({ size = 32, className = "" }: IconProps) {
  return wrap(
    <>
      <rect x="3" y="3" width="26" height="26" fill="#FFF" stroke="#000" />
      <path d="M 22 6 L 26 10 L 12 24 L 7 25 L 8 20 Z" fill="#FFF" stroke="#000" strokeWidth="1" />
      <line x1="20" y1="8" x2="24" y2="12" stroke="#000" strokeWidth="1" />
      <rect x="7" y="25" width="4" height="2" fill="#000" />
    </>,
    size,
    className,
  );
}

/** Vault — safe with dial */
export function VaultIcon({ size = 32, className = "" }: IconProps) {
  return wrap(
    <>
      <rect x="3" y="3" width="26" height="26" fill="#FFF" stroke="#000" />
      <circle cx="16" cy="16" r="8" fill="#FFF" stroke="#000" strokeWidth="1" />
      <circle cx="16" cy="16" r="3" fill="#000" />
      <line x1="16" y1="12" x2="16" y2="14" stroke="#000" strokeWidth="1" />
      <line x1="16" y1="18" x2="16" y2="20" stroke="#000" strokeWidth="1" />
      <line x1="12" y1="16" x2="14" y2="16" stroke="#000" strokeWidth="1" />
      <line x1="18" y1="16" x2="20" y2="16" stroke="#000" strokeWidth="1" />
    </>,
    size,
    className,
  );
}

/** Agents — robot / computer */
export function AgentsIcon({ size = 32, className = "" }: IconProps) {
  return wrap(
    <>
      <rect x="6" y="4" width="20" height="18" fill="#FFF" stroke="#000" />
      <rect x="9" y="7" width="14" height="9" fill="#000" />
      <rect x="11" y="9" width="3" height="3" fill="#0F0" />
      <rect x="18" y="9" width="3" height="3" fill="#0F0" />
      <rect x="13" y="13" width="6" height="1" fill="#FFF" />
      <rect x="12" y="22" width="8" height="6" fill="#FFF" stroke="#000" />
      <rect x="4" y="27" width="24" height="1" fill="#000" />
    </>,
    size,
    className,
  );
}

/** Archive — file cabinet */
export function ArchiveIcon({ size = 32, className = "" }: IconProps) {
  return wrap(
    <>
      <rect x="4" y="3" width="24" height="26" fill="#FFF" stroke="#000" />
      <rect x="4" y="3" width="24" height="8" fill="#FFF" stroke="#000" />
      <rect x="4" y="11" width="24" height="8" fill="#FFF" stroke="#000" />
      <rect x="4" y="19" width="24" height="8" fill="#FFF" stroke="#000" />
      <rect x="14" y="6" width="4" height="2" fill="#000" />
      <rect x="14" y="14" width="4" height="2" fill="#000" />
      <rect x="14" y="22" width="4" height="2" fill="#000" />
    </>,
    size,
    className,
  );
}

/** Stumble — die / random */
export function StumbleIcon({ size = 32, className = "" }: IconProps) {
  return wrap(
    <>
      <rect x="6" y="6" width="20" height="20" fill="#FFF" stroke="#000" />
      <rect x="10" y="10" width="3" height="3" fill="#000" />
      <rect x="19" y="10" width="3" height="3" fill="#000" />
      <rect x="14" y="14" width="3" height="3" fill="#000" />
      <rect x="10" y="19" width="3" height="3" fill="#000" />
      <rect x="19" y="19" width="3" height="3" fill="#000" />
    </>,
    size,
    className,
  );
}

/** Pipe — pipe character */
export function PipeIcon({ size = 32, className = "" }: IconProps) {
  return wrap(
    <>
      <rect x="3" y="3" width="26" height="26" fill="#FFF" stroke="#000" />
      <rect x="6" y="14" width="6" height="4" fill="#000" />
      <rect x="12" y="9" width="4" height="14" fill="#000" />
      <rect x="16" y="14" width="6" height="4" fill="#000" />
      <rect x="22" y="9" width="4" height="14" fill="#000" />
    </>,
    size,
    className,
  );
}

/** Sentiment Index — wave */
export function IndexIcon({ size = 32, className = "" }: IconProps) {
  return wrap(
    <>
      <rect x="3" y="3" width="26" height="26" fill="#FFF" stroke="#000" />
      <path d="M 4 20 L 8 12 L 12 18 L 16 8 L 20 16 L 24 11 L 28 14" fill="none" stroke="#000" strokeWidth="2" />
      <rect x="4" y="24" width="24" height="1" fill="#000" />
    </>,
    size,
    className,
  );
}

/** NeXT cube — accent icon */
export function NeXTCubeIcon({ size = 32, className = "" }: IconProps) {
  return wrap(
    <>
      <rect x="7" y="9" width="18" height="18" fill="#000" />
      <polygon points="7,9 10,5 28,5 25,9" fill="#444" />
      <polygon points="25,9 28,5 28,23 25,27" fill="#222" />
      <rect x="10" y="12" width="12" height="2" fill="#CC0000" />
    </>,
    size,
    className,
  );
}
