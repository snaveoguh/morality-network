// Line icons for the direction C chrome (header, tab bar, More). 24px grid,
// 2px stroke, currentColor — they take the ink of whatever holds them.

type IconProps = { className?: string };

function Svg({ className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export function SearchIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </Svg>
  );
}

export function FeedIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M4 5h16M4 10h16M4 15h10M4 20h10" />
    </Svg>
  );
}

export function LedgerIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M5 4h11l3 3v13H5z" />
      <path d="M9 11l2 2 4-4" />
    </Svg>
  );
}

export function SignalsIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 17l5-6 4 3 6-8 3 3" />
    </Svg>
  );
}

export function MoreIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </Svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}
