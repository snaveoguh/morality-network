"use client";

import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { PooterScene } from "./PooterScene";
import type { PooterMood } from "@/lib/notification-types";

/**
 * Isolated Three.js canvas for the 3D pooter bot.
 * Loaded via dynamic import so @react-three/fiber failures
 * don't prevent the rest of PooterMascot from rendering.
 */
export function Pooter3DCanvas({ mood }: { mood: PooterMood }) {
  return (
    <div className="pointer-events-none h-[96px] w-[96px]">
      <Canvas
        dpr={1}
        camera={{ position: [0, 0, 4], fov: 30 }}
        style={{ background: "transparent" }}
        gl={{ alpha: true, antialias: true }}
      >
        <Suspense fallback={null}>
          <PooterScene mood={mood} />
        </Suspense>
      </Canvas>
    </div>
  );
}
