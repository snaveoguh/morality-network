"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { useNotification } from "@/providers/NotificationProvider";
import { PooterScene } from "./PooterScene";

/**
 * 3D pooter mascot — fixed bottom-right corner on ALL viewports.
 * Desktop (≥1024px): 96×96 Three.js Canvas with 3D printer bot.
 * Mobile  (<1024px): 48×48 2D fallback using pooter-icon.svg.
 * Click toggles the notification panel. Unread count badge.
 */
export function PooterMascot() {
  const { pooterMood, panelOpen, setPanelOpen, notifications } = useNotification();
  const unreadCount = notifications.length;

  return (
    <div className="fixed bottom-4 right-4 z-50">
      <button
        onClick={() => setPanelOpen(!panelOpen)}
        className="relative block cursor-pointer"
        aria-label={panelOpen ? "Close notification panel" : "Open notification panel"}
        title="pooter notifications"
      >
        {/* Desktop: Three.js 3D Canvas */}
        <div className="pointer-events-none hidden h-[96px] w-[96px] lg:block">
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

        {/* Mobile: 2D fallback icon */}
        <div className="pointer-events-none flex h-12 w-12 items-center justify-center border-2 border-[var(--rule)] bg-[var(--paper)] shadow-lg lg:hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pooter-icon.svg" alt="pooter" width={32} height={32} className="opacity-80" />
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
