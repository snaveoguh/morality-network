"use client";

import { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

// ─── Source locations (lat/lon → 3D) ─────────────────────────────────────────

interface SourceLocation {
  name: string;
  lat: number;
  lon: number;
  category: string;
}

/**
 * Major news source locations. When a feed item comes in, we pulse
 * the dot at the source's location on the globe.
 */
const SOURCE_LOCATIONS: SourceLocation[] = [
  // Wire services
  { name: "Reuters", lat: 51.51, lon: -0.13, category: "World" },
  { name: "AP", lat: 40.76, lon: -73.98, category: "World" },
  { name: "AFP", lat: 48.87, lon: 2.33, category: "World" },
  // US
  { name: "NYT", lat: 40.76, lon: -73.97, category: "World" },
  { name: "CNN", lat: 33.76, lon: -84.39, category: "World" },
  { name: "CNBC", lat: 40.73, lon: -74.00, category: "Business" },
  { name: "Bloomberg", lat: 40.76, lon: -73.97, category: "Business" },
  { name: "NPR", lat: 38.90, lon: -77.03, category: "World" },
  { name: "The Hill", lat: 38.90, lon: -77.01, category: "Politics" },
  { name: "ProPublica", lat: 40.71, lon: -74.01, category: "World" },
  // UK
  { name: "BBC", lat: 51.52, lon: -0.14, category: "World" },
  { name: "Guardian", lat: 51.53, lon: -0.12, category: "World" },
  { name: "FT", lat: 51.51, lon: -0.09, category: "Business" },
  // Europe
  { name: "DW", lat: 50.94, lon: 6.96, category: "World" },
  { name: "France24", lat: 48.83, lon: 2.41, category: "World" },
  // Middle East
  { name: "Al Jazeera", lat: 25.29, lon: 51.53, category: "World" },
  // Asia
  { name: "SCMP", lat: 22.28, lon: 114.15, category: "World" },
  { name: "Times of India", lat: 19.08, lon: 72.88, category: "World" },
  { name: "NHK", lat: 35.69, lon: 139.69, category: "World" },
  // Tech
  { name: "TechCrunch", lat: 37.77, lon: -122.42, category: "Tech" },
  { name: "Ars Technica", lat: 37.77, lon: -122.39, category: "Tech" },
  // Crypto
  { name: "CoinDesk", lat: 40.75, lon: -73.99, category: "Crypto" },
  { name: "CoinTelegraph", lat: 40.71, lon: -74.01, category: "Crypto" },
  { name: "The Block", lat: 40.74, lon: -73.99, category: "Crypto" },
  // Science
  { name: "Nature", lat: 51.53, lon: -0.08, category: "Science" },
  { name: "Mongabay", lat: 37.44, lon: -122.16, category: "Environment" },
  // Australia
  { name: "ABC Australia", lat: -33.87, lon: 151.21, category: "World" },
  // South America
  { name: "Buenos Aires Herald", lat: -34.60, lon: -58.38, category: "World" },
  // Africa
  { name: "Daily Nation", lat: -1.29, lon: 36.82, category: "World" },
];

const CATEGORY_COLORS: Record<string, string> = {
  World: "#22C55E",
  Business: "#D4A017",
  Politics: "#8B5CF6",
  Tech: "#06B6D4",
  Crypto: "#22C55E",
  Science: "#3B82F6",
  Environment: "#10B981",
};

function latLonToXYZ(lat: number, lon: number, radius: number): [number, number, number] {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return [
    -(radius * Math.sin(phi) * Math.cos(theta)),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  ];
}

// ─── Globe Mesh ──────────────────────────────────────────────────────────────

function Globe() {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((_state, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.05;
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 48, 48]} />
      <meshStandardMaterial
        color="#0A0A0A"
        wireframe
        wireframeLinewidth={1}
        transparent
        opacity={0.3}
      />
    </mesh>
  );
}

// ─── Source Dots ──────────────────────────────────────────────────────────────

function SourceDots({ activeSources }: { activeSources: Set<string> }) {
  const groupRef = useRef<THREE.Group>(null);

  useFrame((_state, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * 0.05;
    }
  });

  const dots = useMemo(() =>
    SOURCE_LOCATIONS.map((src) => {
      const [x, y, z] = latLonToXYZ(src.lat, src.lon, 1.02);
      const isActive = activeSources.has(src.name.toLowerCase());
      const color = CATEGORY_COLORS[src.category] ?? "#22C55E";
      return { ...src, x, y, z, isActive, color };
    }),
  [activeSources]);

  return (
    <group ref={groupRef}>
      {dots.map((dot) => (
        <mesh key={dot.name} position={[dot.x, dot.y, dot.z]}>
          <sphereGeometry args={[dot.isActive ? 0.025 : 0.012, 8, 8]} />
          <meshBasicMaterial color={dot.color} transparent opacity={dot.isActive ? 1 : 0.4} />
        </mesh>
      ))}
    </group>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

interface NewsGlobeProps {
  /** List of active source names (lowercase) from recent feed items */
  activeSources: string[];
}

export default function NewsGlobe({ activeSources }: NewsGlobeProps) {
  const activeSet = useMemo(() => new Set(activeSources.map((s) => s.toLowerCase())), [activeSources]);

  return (
    <div className="h-full w-full">
      <Canvas
        camera={{ position: [0, 0, 2.5], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.5} />
        <pointLight position={[5, 5, 5]} intensity={0.8} />
        <Globe />
        <SourceDots activeSources={activeSet} />
        <OrbitControls
          enableZoom={false}
          enablePan={false}
          autoRotate={false}
          minPolarAngle={Math.PI * 0.25}
          maxPolarAngle={Math.PI * 0.75}
        />
      </Canvas>
    </div>
  );
}
