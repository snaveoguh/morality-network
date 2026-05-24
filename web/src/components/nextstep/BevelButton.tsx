"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * NeXT-style 3D etched button.
 * 1px white top/left + 1px black bottom/right + slate fill.
 * Inverts the bevel on :active so it sinks like a hardware button.
 */
type BevelButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "default" | "red" | "dark";
};

export const BevelButton = forwardRef<HTMLButtonElement, BevelButtonProps>(
  function BevelButton(
    { children, className = "", variant = "default", ...rest },
    ref,
  ) {
    const variantClass =
      variant === "red"
        ? "bg-[var(--accent-red)] text-white"
        : variant === "dark"
        ? "bg-[var(--chrome-dark)] text-white"
        : "bg-[var(--chrome-mid)] text-[var(--ink)]";

    return (
      <button
        ref={ref}
        type="button"
        {...rest}
        className={`bevel-button ${variantClass} inline-flex items-center justify-center px-3 py-1 text-[11px] font-bold tracking-tight ${className}`}
      >
        {children}
      </button>
    );
  },
);
