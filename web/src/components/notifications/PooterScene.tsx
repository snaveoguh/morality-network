"use client";

import { useRef, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox, QuadraticBezierLine } from "@react-three/drei";
import * as THREE from "three";
import type { PooterMood } from "@/lib/notification-types";

// ---------------------------------------------------------------------------
// Colours (matching newspaper aesthetic + pooter SVG)
// ---------------------------------------------------------------------------
const COL = {
  body: "#D4D0C8",
  face: "#E8E4DC",
  ink: "#1A1A1A",
  eyeHighlight: "#F5F0E8",
  paper: "#E8E4DC",
  paperLine: "#C8C0B0",
  tray: "#C8C0B0",
  slot: "#8A8A8A",
  // Status light colours
  green: new THREE.Color("#4CAF50"),
  yellow: new THREE.Color("#FFC107"),
  red: new THREE.Color("#8B0000"),
  cyan: new THREE.Color("#00BCD4"),
  dark: new THREE.Color("#333333"),
} as const;

// ---------------------------------------------------------------------------
// Animated state (mutated in useFrame for zero-alloc)
// ---------------------------------------------------------------------------
interface AnimState {
  bobY: number;
  rotY: number;
  rotZ: number;
  shakeX: number;
  eyeScaleY: number;
  paperBounce: number;
  moodElapsed: number;
  prevMood: PooterMood;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

interface Props {
  mood: PooterMood;
}

export function PooterScene({ mood }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const leftEyeRef = useRef<THREE.Mesh>(null);
  const rightEyeRef = useRef<THREE.Mesh>(null);
  const paperRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.Mesh>(null);
  const lightMatRef = useRef<THREE.MeshStandardMaterial>(null);

  const anim = useRef<AnimState>({
    bobY: 0,
    rotY: 0,
    rotZ: 0,
    shakeX: 0,
    eyeScaleY: 1,
    paperBounce: 0,
    moodElapsed: 0,
    prevMood: "idle",
  });

  // Track mood changes
  if (mood !== anim.current.prevMood) {
    anim.current.prevMood = mood;
    anim.current.moodElapsed = 0;
  }

  useFrame((_, delta) => {
    const a = anim.current;
    const group = groupRef.current;
    if (!group) return;

    a.moodElapsed += delta;
    const t = a.moodElapsed;

    // ---- Target values per mood ----
    let targetEyeY = 1;
    let targetRotZ = 0;
    let bobSpeed = 1.5;
    let bobAmp = 0.02;
    let rotYAmp = 0.1;
    let shakeDecay = 0;
    let paperBounceAmp = 0.005;
    let lightColor = COL.green;

    switch (mood) {
      case "excited":
        bobSpeed = 4;
        bobAmp = 0.05;
        rotYAmp = 0.15;
        targetEyeY = 1.3;
        paperBounceAmp = 0.03;
        lightColor = t % 0.3 < 0.15 ? COL.cyan : COL.green;
        break;
      case "alert":
        shakeDecay = Math.max(0, 1 - t * 0.5);
        targetEyeY = 0.5;
        lightColor = COL.red;
        break;
      case "thinking":
        targetEyeY = 0.6;
        targetRotZ = 0.05;
        bobSpeed = 1;
        bobAmp = 0.01;
        lightColor = t % 0.5 < 0.25 ? COL.yellow : COL.dark;
        break;
    }

    // ---- Apply with lerp ----
    const lerp = THREE.MathUtils.lerp;
    const lerpF = 0.08;

    a.bobY = lerp(a.bobY, Math.sin(t * bobSpeed) * bobAmp, lerpF);
    a.rotY = lerp(a.rotY, Math.sin(t * 0.8) * rotYAmp, lerpF);
    a.rotZ = lerp(a.rotZ, targetRotZ, lerpF);
    a.shakeX = shakeDecay * Math.sin(t * 12) * 0.015;
    a.eyeScaleY = lerp(a.eyeScaleY, targetEyeY, lerpF);
    a.paperBounce = lerp(a.paperBounce, Math.abs(Math.sin(t * 2)) * paperBounceAmp, lerpF);

    // Apply to group
    group.position.y = a.bobY;
    group.position.x = a.shakeX;
    group.rotation.y = a.rotY;
    group.rotation.z = a.rotZ;

    // Eyes
    if (leftEyeRef.current) leftEyeRef.current.scale.y = a.eyeScaleY;
    if (rightEyeRef.current) rightEyeRef.current.scale.y = a.eyeScaleY;

    // Paper bounce
    if (paperRef.current) paperRef.current.position.y = 0.95 + a.paperBounce;

    // Status light
    if (lightMatRef.current) {
      lightMatRef.current.color.lerp(lightColor, 0.1);
      lightMatRef.current.emissive.lerp(lightColor, 0.1);
    }
  });

  // Mouth curve points
  const mouthStart = useMemo(() => new THREE.Vector3(-0.25, -0.2, 0.56), []);
  const mouthMid = useMemo(() => new THREE.Vector3(0, -0.3, 0.56), []);
  const mouthEnd = useMemo(() => new THREE.Vector3(0.25, -0.2, 0.56), []);

  return (
    <>
      <ambientLight intensity={0.7} />
      <directionalLight position={[2, 3, 4]} intensity={0.6} />

      <group ref={groupRef}>
        {/* Body — printer chassis */}
        <RoundedBox args={[2.4, 1.6, 1]} radius={0.15} smoothness={2}>
          <meshStandardMaterial color={COL.body} roughness={0.9} metalness={0.05} />
        </RoundedBox>

        {/* Face panel — inset screen */}
        <RoundedBox args={[1.8, 1.1, 0.1]} radius={0.08} smoothness={2} position={[0, 0.05, 0.46]}>
          <meshStandardMaterial color={COL.face} roughness={0.85} />
        </RoundedBox>

        {/* Left eye */}
        <mesh ref={leftEyeRef} position={[-0.35, 0.15, 0.55]}>
          <boxGeometry args={[0.25, 0.25, 0.1]} />
          <meshStandardMaterial color={COL.ink} />
        </mesh>
        {/* Left eye highlight */}
        <mesh position={[-0.28, 0.22, 0.61]}>
          <boxGeometry args={[0.08, 0.08, 0.02]} />
          <meshStandardMaterial color={COL.eyeHighlight} />
        </mesh>

        {/* Right eye */}
        <mesh ref={rightEyeRef} position={[0.35, 0.15, 0.55]}>
          <boxGeometry args={[0.25, 0.25, 0.1]} />
          <meshStandardMaterial color={COL.ink} />
        </mesh>
        {/* Right eye highlight */}
        <mesh position={[0.42, 0.22, 0.61]}>
          <boxGeometry args={[0.08, 0.08, 0.02]} />
          <meshStandardMaterial color={COL.eyeHighlight} />
        </mesh>

        {/* Mouth — curved smile */}
        <QuadraticBezierLine
          start={mouthStart}
          mid={mouthMid}
          end={mouthEnd}
          color={COL.ink}
          lineWidth={2}
        />

        {/* Paper — sticking out the top */}
        <mesh ref={paperRef} position={[0, 0.95, 0]}>
          <boxGeometry args={[1.6, 0.8, 0.05]} />
          <meshStandardMaterial color={COL.paper} />
        </mesh>
        {/* Paper "text" lines */}
        <mesh position={[0, 1.1, 0.03]}>
          <boxGeometry args={[1.0, 0.03, 0.01]} />
          <meshStandardMaterial color={COL.paperLine} />
        </mesh>
        <mesh position={[0, 1.0, 0.03]}>
          <boxGeometry args={[1.2, 0.03, 0.01]} />
          <meshStandardMaterial color={COL.paperLine} />
        </mesh>
        <mesh position={[0, 0.9, 0.03]}>
          <boxGeometry args={[0.8, 0.03, 0.01]} />
          <meshStandardMaterial color={COL.paperLine} />
        </mesh>

        {/* Feed slot */}
        <mesh position={[0, 0.58, 0.3]}>
          <boxGeometry args={[2.0, 0.12, 0.6]} />
          <meshStandardMaterial color={COL.slot} />
        </mesh>

        {/* Feed tray — bottom */}
        <RoundedBox args={[2.0, 0.3, 0.8]} radius={0.06} smoothness={2} position={[0, -0.75, 0.1]}>
          <meshStandardMaterial color={COL.tray} roughness={0.85} />
        </RoundedBox>

        {/* Status light */}
        <mesh ref={lightRef} position={[0.9, 0.6, 0.51]}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshStandardMaterial
            ref={lightMatRef}
            color="#4CAF50"
            emissive="#4CAF50"
            emissiveIntensity={0.5}
          />
        </mesh>
      </group>
    </>
  );
}
