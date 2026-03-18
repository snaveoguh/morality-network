import { withBrand } from "@/lib/brand";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: withBrand("Bot Telemetry"),
  description: "Live swarm console, token scanner output, and inter-agent message telemetry.",
};

export default function BotsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
