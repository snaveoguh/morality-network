"use client";

import { useRef, useMemo, useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox, QuadraticBezierLine } from "@react-three/drei";
import * as THREE from "three";
import type { PooterMood } from "@/lib/notification-types";

// ---------------------------------------------------------------------------
// Colours (matching newspaper aesthetic + kawaii pooter)
// ---------------------------------------------------------------------------
const COL = {
  body: "#D4D0C8",
  face: "#E8E4DC",
  ink: "#1A1A1A",
  eyeWhite: "#FFFFFF",
  pupil: "#1A1A1A",
  eyeHighlight: "#F5F0E8",
  blush: "#FFB7B7",
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
// Sassy messages
// ---------------------------------------------------------------------------
const SASSY_MESSAGES = [
  "go outside",
  "stop looking at the screen",
  "drink water",
  "blink. now.",
  "touch grass",
  "you've been here a while...",
  "the sun exists btw",
  "are you ok?",
  "take a deep breath",
  "stretch your neck",
  "when did you last eat?",
  "close this tab",
  "your posture rn...",
  "do you have a chair?",
  "i'm judging you",
  "go for a walk",
];

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
  blinkTimer: number;
  blinkPhase: number; // 0=open, 1=closing, 2=opening
  pupilX: number;
  pupilTargetX: number;
  pupilChangeTimer: number;
  globalTime: number;
}

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

interface Props {
  mood: PooterMood;
  onSassyMessage?: (msg: string) => void;
}

export function PooterScene({ mood, onSassyMessage }: Props) {
  const groupRef = useRef<THREE.Group>(null);
  const leftEyeRef = useRef<THREE.Mesh>(null);
  const rightEyeRef = useRef<THREE.Mesh>(null);
  const leftPupilRef = useRef<THREE.Mesh>(null);
  const rightPupilRef = useRef<THREE.Mesh>(null);
  const leftBlushRef = useRef<THREE.Mesh>(null);
  const rightBlushRef = useRef<THREE.Mesh>(null);
  const paperRef = useRef<THREE.Mesh>(null);
  const lightMatRef = useRef<THREE.MeshStandardMaterial>(null);

  // Sassy message timer
  const [sassyIndex, setSassyIndex] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      const idx = Math.floor(Math.random() * SASSY_MESSAGES.length);
      setSassyIndex(idx);
      onSassyMessage?.(SASSY_MESSAGES[idx]);
    }, 45_000 + Math.random() * 30_000); // every 45-75 seconds
    return () => clearInterval(interval);
  }, [onSassyMessage]);

  // Suppress unused var warning
  void sassyIndex;

  const anim = useRef<AnimState>({
    bobY: 0,
    rotY: 0,
    rotZ: 0,
    shakeX: 0,
    eyeScaleY: 1,
    paperBounce: 0,
    moodElapsed: 0,
    prevMood: "idle",
    blinkTimer: 3,
    blinkPhase: 0,
    pupilX: 0,
    pupilTargetX: 0,
    pupilChangeTimer: 2,
    globalTime: 0,
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
    a.globalTime += delta;
    const t = a.moodElapsed;

    // ---- Blink logic ----
    a.blinkTimer -= delta;
    if (a.blinkPhase === 0 && a.blinkTimer <= 0) {
      a.blinkPhase = 1; // start closing
      a.blinkTimer = 0.08; // close duration
    } else if (a.blinkPhase === 1 && a.blinkTimer <= 0) {
      a.blinkPhase = 2; // start opening
      a.blinkTimer = 0.1; // open duration
    } else if (a.blinkPhase === 2 && a.blinkTimer <= 0) {
      a.blinkPhase = 0; // fully open
      a.blinkTimer = 2.5 + Math.random() * 4; // next blink in 2.5-6.5s
    }

    let blinkScale = 1;
    if (a.blinkPhase === 1) blinkScale = Math.max(0.05, a.blinkTimer / 0.08);
    else if (a.blinkPhase === 2) blinkScale = 1 - Math.max(0, a.blinkTimer / 0.1);

    // ---- Pupil wandering ----
    a.pupilChangeTimer -= delta;
    if (a.pupilChangeTimer <= 0) {
      a.pupilTargetX = (Math.random() - 0.5) * 0.08;
      a.pupilChangeTimer = 1.5 + Math.random() * 3;
    }
    a.pupilX += (a.pupilTargetX - a.pupilX) * 0.05;

    // ---- Target values per mood ----
    let targetEyeY = 1;
    let targetRotZ = 0;
    let bobSpeed = 1.5;
    let bobAmp = 0.02;
    let rotYAmp = 0.1;
    let shakeDecay = 0;
    let paperBounceAmp = 0.005;
    let lightColor = COL.green;
    let blushOpacity = 0.3; // default subtle blush

    switch (mood) {
      case "excited":
        bobSpeed = 4;
        bobAmp = 0.05;
        rotYAmp = 0.15;
        targetEyeY = 1.3;
        paperBounceAmp = 0.03;
        lightColor = t % 0.3 < 0.15 ? COL.cyan : COL.green;
        blushOpacity = 0.7;
        break;
      case "alert":
        shakeDecay = Math.max(0, 1 - t * 0.5);
        targetEyeY = 0.5;
        lightColor = COL.red;
        blushOpacity = 0.1;
        break;
      case "thinking":
        targetEyeY = 0.6;
        targetRotZ = 0.05;
        bobSpeed = 1;
        bobAmp = 0.01;
        lightColor = t % 0.5 < 0.25 ? COL.yellow : COL.dark;
        blushOpacity = 0.2;
        break;
    }

    // ---- Apply with lerp ----
    const lerp = THREE.MathUtils.lerp;
    const lerpF = 0.08;

    a.bobY = lerp(a.bobY, Math.sin(t * bobSpeed) * bobAmp, lerpF);
    a.rotY = lerp(a.rotY, Math.sin(t * 0.8) * rotYAmp, lerpF);
    a.rotZ = lerp(a.rotZ, targetRotZ, lerpF);
    a.shakeX = shakeDecay * Math.sin(t * 12) * 0.015;
    a.eyeScaleY = lerp(a.eyeScaleY, targetEyeY * blinkScale, 0.2);
    a.paperBounce = lerp(a.paperBounce, Math.abs(Math.sin(t * 2)) * paperBounceAmp, lerpF);

    // Apply to group
    group.position.y = a.bobY;
    group.position.x = a.shakeX;
    group.rotation.y = a.rotY;
    group.rotation.z = a.rotZ;

    // Eye whites (scale Y for blink)
    if (leftEyeRef.current) leftEyeRef.current.scale.y = a.eyeScaleY;
    if (rightEyeRef.current) rightEyeRef.current.scale.y = a.eyeScaleY;

    // Pupils (move X for look direction, hide during blink)
    const pupilVisible = a.eyeScaleY > 0.3;
    if (leftPupilRef.current) {
      leftPupilRef.current.position.x = -0.35 + a.pupilX;
      leftPupilRef.current.visible = pupilVisible;
    }
    if (rightPupilRef.current) {
      rightPupilRef.current.position.x = 0.35 + a.pupilX;
      rightPupilRef.current.visible = pupilVisible;
    }

    // Blush opacity
    if (leftBlushRef.current) {
      (leftBlushRef.current.material as THREE.MeshStandardMaterial).opacity = blushOpacity;
    }
    if (rightBlushRef.current) {
      (rightBlushRef.current.material as THREE.MeshStandardMaterial).opacity = blushOpacity;
    }

    // Paper bounce
    if (paperRef.current) paperRef.current.position.y = 0.95 + a.paperBounce;

    // Status light
    if (lightMatRef.current) {
      lightMatRef.current.color.lerp(lightColor, 0.1);
      lightMatRef.current.emissive.lerp(lightColor, 0.1);
    }
  });

  // Mouth curve points — small kawaii smile
  const mouthStart = useMemo(() => new THREE.Vector3(-0.15, -0.22, 0.56), []);
  const mouthMid = useMemo(() => new THREE.Vector3(0, -0.28, 0.56), []);
  const mouthEnd = useMemo(() => new THREE.Vector3(0.15, -0.22, 0.56), []);

  return (
    <>
      {/* Dramatic lighting */}
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[3, 4, 5]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={256}
        shadow-mapSize-height={256}
        shadow-camera-near={0.5}
        shadow-camera-far={15}
        shadow-bias={-0.001}
      />
      <directionalLight position={[-2, 1, -1]} intensity={0.15} color="#8899AA" />
      {/* Rim light from behind */}
      <pointLight position={[0, 2, -3]} intensity={0.4} color="#FFE0B2" />

      <group ref={groupRef}>
        {/* Body — printer chassis */}
        <RoundedBox args={[2.4, 1.6, 1]} radius={0.15} smoothness={2} castShadow receiveShadow>
          <meshStandardMaterial color={COL.body} roughness={0.9} metalness={0.05} />
        </RoundedBox>

        {/* Face panel — inset screen */}
        <RoundedBox args={[1.8, 1.1, 0.1]} radius={0.08} smoothness={2} position={[0, 0.05, 0.46]}>
          <meshStandardMaterial color={COL.face} roughness={0.85} />
        </RoundedBox>

        {/* === KAWAII EYES === */}
        {/* Left eye white — bigger, rounder */}
        <mesh ref={leftEyeRef} position={[-0.35, 0.15, 0.53]}>
          <sphereGeometry args={[0.18, 16, 16]} />
          <meshStandardMaterial color={COL.eyeWhite} />
        </mesh>
        {/* Left pupil — tracks movement */}
        <mesh ref={leftPupilRef} position={[-0.35, 0.13, 0.62]}>
          <sphereGeometry args={[0.1, 12, 12]} />
          <meshStandardMaterial color={COL.pupil} />
        </mesh>
        {/* Left eye highlight — sparkle */}
        <mesh position={[-0.29, 0.2, 0.68]}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshStandardMaterial color={COL.eyeHighlight} emissive="#FFFFFF" emissiveIntensity={0.3} />
        </mesh>

        {/* Right eye white — bigger, rounder */}
        <mesh ref={rightEyeRef} position={[0.35, 0.15, 0.53]}>
          <sphereGeometry args={[0.18, 16, 16]} />
          <meshStandardMaterial color={COL.eyeWhite} />
        </mesh>
        {/* Right pupil — tracks movement */}
        <mesh ref={rightPupilRef} position={[0.35, 0.13, 0.62]}>
          <sphereGeometry args={[0.1, 12, 12]} />
          <meshStandardMaterial color={COL.pupil} />
        </mesh>
        {/* Right eye highlight — sparkle */}
        <mesh position={[0.41, 0.2, 0.68]}>
          <sphereGeometry args={[0.035, 8, 8]} />
          <meshStandardMaterial color={COL.eyeHighlight} emissive="#FFFFFF" emissiveIntensity={0.3} />
        </mesh>

        {/* === BLUSH MARKS === */}
        <mesh ref={leftBlushRef} position={[-0.55, -0.02, 0.52]} rotation={[0, 0, 0.1]}>
          <circleGeometry args={[0.1, 16]} />
          <meshStandardMaterial color={COL.blush} transparent opacity={0.3} />
        </mesh>
        <mesh ref={rightBlushRef} position={[0.55, -0.02, 0.52]} rotation={[0, 0, -0.1]}>
          <circleGeometry args={[0.1, 16]} />
          <meshStandardMaterial color={COL.blush} transparent opacity={0.3} />
        </mesh>

        {/* Mouth — small kawaii curve */}
        <QuadraticBezierLine
          start={mouthStart}
          mid={mouthMid}
          end={mouthEnd}
          color={COL.ink}
          lineWidth={2}
        />

        {/* Paper — sticking out the top */}
        <mesh ref={paperRef} position={[0, 0.95, 0]} castShadow>
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
        <RoundedBox args={[2.0, 0.3, 0.8]} radius={0.06} smoothness={2} position={[0, -0.75, 0.1]} receiveShadow>
          <meshStandardMaterial color={COL.tray} roughness={0.85} />
        </RoundedBox>

        {/* Status light */}
        <mesh position={[0.9, 0.6, 0.51]}>
          <sphereGeometry args={[0.08, 8, 8]} />
          <meshStandardMaterial
            ref={lightMatRef}
            color="#4CAF50"
            emissive="#4CAF50"
            emissiveIntensity={0.5}
          />
        </mesh>
      </group>

      {/* Floor shadow catcher */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.2, 0]} receiveShadow>
        <planeGeometry args={[6, 6]} />
        <shadowMaterial opacity={0.3} />
      </mesh>
    </>
  );
}
