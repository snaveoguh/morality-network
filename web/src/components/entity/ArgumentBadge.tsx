"use client";

// Argument type enum matching Solidity
enum ArgumentType {
  Discussion = 0,
  Claim = 1,
  Counterclaim = 2,
  Evidence = 3,
  Source = 4,
}

const LABELS: Record<ArgumentType, string> = {
  [ArgumentType.Discussion]: "Discussion",
  [ArgumentType.Claim]: "Claim",
  [ArgumentType.Counterclaim]: "Counterclaim",
  [ArgumentType.Evidence]: "Evidence",
  [ArgumentType.Source]: "Source",
};

const STYLES: Record<ArgumentType, { bg: string; text: string; border: string }> = {
  [ArgumentType.Discussion]: { bg: "transparent", text: "var(--ink-faint)", border: "var(--rule-light)" },
  [ArgumentType.Claim]: { bg: "var(--ink)", text: "var(--paper)", border: "var(--ink)" },
  [ArgumentType.Counterclaim]: { bg: "var(--accent-red)", text: "var(--paper)", border: "var(--accent-red)" },
  [ArgumentType.Evidence]: { bg: "transparent", text: "var(--ink-light)", border: "var(--rule)" },
  [ArgumentType.Source]: { bg: "transparent", text: "var(--ink-faint)", border: "var(--rule-light)" },
};

interface ArgumentBadgeProps {
  argumentType: number;
}

export function ArgumentBadge({ argumentType }: ArgumentBadgeProps) {
  const argType = argumentType as ArgumentType;
  // Don't show badge for plain discussion
  if (argType === ArgumentType.Discussion) return null;

  const label = LABELS[argType] || "Unknown";
  const style = STYLES[argType] || STYLES[ArgumentType.Discussion];

  return (
    <span
      className="inline-block border px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-wider"
      style={{
        backgroundColor: style.bg,
        color: style.text,
        borderColor: style.border,
      }}
    >
      {label}
    </span>
  );
}

export { ArgumentType };
