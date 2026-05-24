interface DitherSwatchProps {
  pattern:
    | "solid"
    | "75"
    | "50"
    | "25"
    | "diag"
    | "diag-back"
    | "cross"
    | "dots"
    | "dots-coarse"
    | "vstripe"
    | "hstripe"
    | "herring";
  size?: number;
  title?: string;
  selected?: boolean;
  onClick?: () => void;
}

const CLASS_MAP: Record<DitherSwatchProps["pattern"], string> = {
  solid: "dither-solid",
  "75": "dither-75",
  "50": "dither-50",
  "25": "dither-25",
  diag: "dither-diag",
  "diag-back": "dither-diag-back",
  cross: "dither-cross",
  dots: "dither-dots",
  "dots-coarse": "dither-dots-coarse",
  vstripe: "dither-vstripe",
  hstripe: "dither-hstripe",
  herring: "dither-herring",
};

export function DitherSwatch({ pattern, size = 16, title, selected, onClick }: DitherSwatchProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={title || pattern}
      title={title || pattern}
      className={CLASS_MAP[pattern]}
      style={{
        width: size,
        height: size,
        border: selected ? "2px solid var(--ink)" : undefined,
        outline: selected ? "1px solid var(--bg)" : undefined,
      }}
    />
  );
}
