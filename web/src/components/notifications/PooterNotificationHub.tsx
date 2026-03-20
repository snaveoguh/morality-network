"use client";

import dynamic from "next/dynamic";
import { NotificationStack } from "./NotificationStack";
import { NotificationPanel } from "./NotificationPanel";
import { useMarketAlerts } from "@/hooks/useMarketAlerts";
import { useSignalAlerts } from "@/hooks/useSignalAlerts";
import { useAgentEventAlerts } from "@/hooks/useAgentEventAlerts";

// Dynamic import for the 3D mascot to avoid SSR issues with Three.js
const PooterMascot = dynamic(
  () => import("./PooterMascot").then((m) => m.PooterMascot),
  { ssr: false },
);

/**
 * Composite notification hub — mounted once in the root layout.
 * Assembles the toast stack, 3D mascot, notification panel,
 * and activates all smart alert hooks.
 */
export function PooterNotificationHub() {
  // Activate smart alert hooks
  useMarketAlerts();
  useSignalAlerts();
  useAgentEventAlerts();

  return (
    <>
      <NotificationStack />
      <PooterMascot />
      <NotificationPanel />
    </>
  );
}
