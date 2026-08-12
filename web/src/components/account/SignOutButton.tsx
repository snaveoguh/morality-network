"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/account/logout", { method: "POST" });
        router.refresh();
      }}
      className="text-[11px] uppercase tracking-[0.16em] text-[var(--ink-faint)] underline underline-offset-4 transition-colors hover:text-[var(--accent-red)] disabled:opacity-50"
    >
      {busy ? "Signing out…" : "Sign out"}
    </button>
  );
}
