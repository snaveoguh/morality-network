"use client";

import { AbiPanel } from "./AbiPanel";

interface ReadTabProps {
  address: string;
  abi: any[];
}

export function ReadTab({ address, abi }: ReadTabProps) {
  if (!abi || abi.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="font-headline-serif text-base text-[var(--ink)]">
          Contract source not verified
        </p>
        <p className="mt-1 font-mono text-[11px] text-[var(--ink-faint)]">
          ABI is unavailable. Verify the contract on Basescan to enable read
          functions.
        </p>
      </div>
    );
  }

  return <AbiPanel abi={abi} address={address} mode="read" />;
}
