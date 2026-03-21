"use client";

import { Component, type ReactNode } from "react";
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

// Error boundary so notification hub failures don't crash the whole app
interface EBState { hasError: boolean }
class HubErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(err: Error) {
    console.error("[PooterNotificationHub] Crashed:", err.message);
  }
  render() { return this.state.hasError ? null : this.props.children; }
}

/**
 * Inner component that activates hooks (hooks can't be inside class components).
 */
function PooterNotificationHubInner() {
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

/**
 * Composite notification hub — mounted once in the root layout.
 * Assembles the toast stack, 3D mascot, notification panel,
 * and activates all smart alert hooks.
 * Wrapped in error boundary so crashes don't affect the rest of the app.
 */
export function PooterNotificationHub() {
  return (
    <HubErrorBoundary>
      <PooterNotificationHubInner />
    </HubErrorBoundary>
  );
}
