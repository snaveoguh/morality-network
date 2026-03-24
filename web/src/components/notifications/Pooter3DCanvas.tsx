"use client";

import { Suspense, useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { PooterScene } from "./PooterScene";
import type { PooterMood } from "@/lib/notification-types";

/**
 * Isolated Three.js canvas for the 3D pooter bot.
 * Tracks mouse position globally via a ref (zero re-renders)
 * and pipes it to the scene so pooter's eyes follow the cursor.
 */
export function Pooter3DCanvas({ mood, onSassyMessage }: { mood: PooterMood; onSassyMessage?: (msg: string) => void }) {
  const mousePosRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mousePosRef.current.x = (e.clientX / window.innerWidth) * 2 - 1;
      mousePosRef.current.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("mousemove", onMove, { passive: true });
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

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
          <PooterScene mood={mood} onSassyMessage={onSassyMessage} mousePosRef={mousePosRef} />
        </Suspense>
      </Canvas>
    </div>
  );
}
