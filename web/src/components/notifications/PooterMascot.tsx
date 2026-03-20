"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { useNotification } from "@/providers/NotificationProvider";
import { PooterScene } from "./PooterScene";

/**
 * 3D pooter mascot — fixed bottom-right corner.
 * Hidden on mobile (< lg). Click toggles the notification panel.
 * Displays unread count badge when notifications exist.
 */
export function PooterMascot() {
  const { pooterMood, panelOpen, setPanelOpen, notifications } = useNotification();
  const unreadCount = notifications.length;

  return (
    <div className="fixed bottom-4 right-4 z-50 hidden lg:block">
      {/* Click target — slightly larger than the canvas */}
      <button
        onClick={() => setPanelOpen(!panelOpen)}
        className="relative block h-[96px] w-[96px] cursor-pointer"
        aria-label={panelOpen ? "Close notification panel" : "Open notification panel"}
        title="pooter notifications"
      >
        {/* Three.js Canvas */}
        <div className="pointer-events-none h-[96px] w-[96px]">
          <Canvas
            dpr={1}
            camera={{ position: [0, 0, 4], fov: 30 }}
            style={{ background: "transparent" }}
            gl={{ alpha: true, antialias: true }}
          >
            <Suspense fallback={null}>
              <PooterScene mood={pooterMood} />
            </Suspense>
          </Canvas>
        </div>

        {/* Notification count badge */}
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center bg-[var(--accent-red)] font-mono text-[8px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
    </div>
  );
}
