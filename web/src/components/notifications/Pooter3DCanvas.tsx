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
export function Pooter3DCanvas({ mood, onSassyMessage }: { mood: PooterMood; onSassyMessage?: (msg: string) => void }) {
  return (
    <div className="pointer-events-none h-[48px] w-[48px]">
      <Canvas
        dpr={2}
        camera={{ position: [0, 0, 3.5], fov: 32 }}
        shadows
        style={{ background: "transparent" }}
        gl={{ alpha: true, antialias: true }}
      >
        <Suspense fallback={null}>
          <PooterScene mood={mood} onSassyMessage={onSassyMessage} />
        </Suspense>
      </Canvas>
    </div>
  );
}
