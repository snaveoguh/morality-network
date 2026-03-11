"use client";

import { useRef, useState, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls, Line } from "@react-three/drei";
import type { FundingGraph, FundingNode, FundingEdge, FundingNodeType } from "@/lib/funding-tree";
import type { Mesh } from "three";

// ============================================================================
// FUNDING TREE — Force-directed ownership graph rendered in Three.js
//
// Grayscale newspaper aesthetic. Nodes = spheres sized by importance.
// Edges = lines showing ownership/funding relationships.
// Click node → popover with details and morality score.
//
// Uses a simple spring-based force-directed layout computed on mount.
// ============================================================================

// ── Layout Constants ────────────────────────────────────────────────────────

const NODE_SIZES: Record<FundingNodeType, number> = {
  conglomerate: 0.5,
  state: 0.45,
  owner: 0.35,
  funder: 0.35,
  individual: 0.3,
  source: 0.25,
};

const NODE_COLORS: Record<FundingNodeType, string> = {
  conglomerate: "#1A1A1A",
  state: "#3A3A3A",
  owner: "#4A4A4A",
  funder: "#5A5A5A",
  individual: "#6A6A6A",
  source: "#8A8A8A",
};

// ── Force-directed layout ───────────────────────────────────────────────────

interface LayoutNode extends FundingNode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function computeLayout(
  nodes: FundingNode[],
  edges: FundingEdge[],
  iterations = 100,
): LayoutNode[] {
  // Initialize positions in a circle
  const layoutNodes: LayoutNode[] = nodes.map((node, i) => {
    const angle = (2 * Math.PI * i) / nodes.length;
    const radius = 2;
    return {
      ...node,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
    };
  });

  const nodeMap = new Map(layoutNodes.map((n) => [n.id, n]));

  for (let iter = 0; iter < iterations; iter++) {
    const cooling = 1 - iter / iterations;
    const repulsion = 3.0 * cooling;
    const attraction = 0.15;
    const damping = 0.85;

    // Repulsive force between all nodes
    for (let i = 0; i < layoutNodes.length; i++) {
      for (let j = i + 1; j < layoutNodes.length; j++) {
        const a = layoutNodes[i];
        const b = layoutNodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
        const force = repulsion / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    // Attractive force along edges
    for (const edge of edges) {
      const a = nodeMap.get(edge.from);
      const b = nodeMap.get(edge.to);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const force = attraction * dist * edge.weight;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    // Gravity toward center
    for (const node of layoutNodes) {
      node.vx -= node.x * 0.02;
      node.vy -= node.y * 0.02;
    }

    // Apply velocity with damping
    for (const node of layoutNodes) {
      node.vx *= damping;
      node.vy *= damping;
      node.x += node.vx;
      node.y += node.vy;
    }
  }

  return layoutNodes;
}

// ── Three.js Components ─────────────────────────────────────────────────────

function TreeNode({
  node,
  onSelect,
  isSelected,
}: {
  node: LayoutNode;
  onSelect: (node: LayoutNode | null) => void;
  isSelected: boolean;
}) {
  const meshRef = useRef<Mesh>(null!);
  const size = NODE_SIZES[node.type] || 0.25;
  const baseColor = NODE_COLORS[node.type] || "#888";

  // Score affects opacity — higher score = brighter
  const scoreOpacity = 0.4 + (node.score / 100) * 0.6;

  useFrame(() => {
    if (meshRef.current) {
      // Subtle pulse for selected node
      if (isSelected) {
        const scale = 1 + Math.sin(Date.now() * 0.003) * 0.1;
        meshRef.current.scale.setScalar(scale);
      } else {
        meshRef.current.scale.setScalar(1);
      }
    }
  });

  return (
    <group position={[node.x, node.y, 0]}>
      <mesh
        ref={meshRef}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(isSelected ? null : node);
        }}
        onPointerOver={() => { document.body.style.cursor = "pointer"; }}
        onPointerOut={() => { document.body.style.cursor = "default"; }}
      >
        <sphereGeometry args={[size, 16, 16]} />
        <meshStandardMaterial
          color={baseColor}
          transparent
          opacity={scoreOpacity}
          roughness={0.8}
          metalness={0.1}
        />
      </mesh>

      {/* Label — HTML overlay */}
      <Html
        center
        distanceFactor={8}
        style={{
          pointerEvents: "none",
          userSelect: "none",
          whiteSpace: "nowrap",
        }}
        position={[0, -(size + 0.2), 0]}
      >
        <div
          className="font-mono text-[7px] uppercase tracking-[0.12em]"
          style={{
            color: isSelected ? "var(--ink)" : "var(--ink-faint)",
            fontWeight: isSelected ? "bold" : "normal",
          }}
        >
          {node.label}
        </div>
      </Html>

      {/* Score badge */}
      <Html
        center
        distanceFactor={8}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        <div
          className="font-mono text-[6px] font-bold"
          style={{ color: "var(--paper)" }}
        >
          {node.score}
        </div>
      </Html>
    </group>
  );
}

function TreeEdge({ edge, nodeMap }: { edge: FundingEdge; nodeMap: Map<string, LayoutNode> }) {
  const from = nodeMap.get(edge.from);
  const to = nodeMap.get(edge.to);
  if (!from || !to) return null;

  const points = useMemo(
    () =>
      [
        [from.x, from.y, 0],
        [to.x, to.y, 0],
      ] as [number, number, number][],
    [from.x, from.y, to.x, to.y],
  );

  return (
    <Line
      points={points}
      color="#AAAAAA"
      transparent
      opacity={0.3 + edge.weight * 0.4}
      lineWidth={1}
    />
  );
}

function TreeScene({ graph }: { graph: FundingGraph }) {
  const [selected, setSelected] = useState<LayoutNode | null>(null);

  const layoutNodes = useMemo(
    () => computeLayout(graph.nodes, graph.edges),
    [graph.nodes, graph.edges],
  );

  const nodeMap = useMemo(
    () => new Map(layoutNodes.map((n) => [n.id, n])),
    [layoutNodes],
  );

  return (
    <>
      <ambientLight intensity={0.6} />
      <pointLight position={[5, 5, 5]} intensity={0.4} />

      {/* Edges */}
      {graph.edges.map((edge, i) => (
        <TreeEdge key={`${edge.from}-${edge.to}-${i}`} edge={edge} nodeMap={nodeMap} />
      ))}

      {/* Nodes */}
      {layoutNodes.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          onSelect={setSelected}
          isSelected={selected?.id === node.id}
        />
      ))}

      {/* Selected node popover */}
      {selected && (
        <Html
          center
          position={[selected.x + 1.2, selected.y + 0.5, 0]}
          style={{ pointerEvents: "auto" }}
        >
          <div
            className="w-44 border-2 border-[var(--rule)] bg-[var(--paper)] p-2.5 shadow-md"
            onClick={() => setSelected(null)}
          >
            <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]">
              {selected.label}
            </p>
            <p className="mt-0.5 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
              {selected.type} {selected.country ? `· ${selected.country}` : ""}
            </p>

            {/* Score bar */}
            <div className="mt-2 flex items-center gap-1.5">
              <div className="h-1 flex-1 bg-[var(--rule-light)]">
                <div
                  className="h-full bg-[var(--ink)]"
                  style={{ width: `${selected.score}%` }}
                />
              </div>
              <span className="font-mono text-[8px] font-bold text-[var(--ink)]">
                {selected.score}
              </span>
            </div>

            {selected.bias && (
              <p className="mt-1 font-mono text-[7px] uppercase tracking-wider text-[var(--ink-faint)]">
                Bias: {selected.bias}
              </p>
            )}
            {selected.factuality && (
              <p className="font-mono text-[7px] uppercase tracking-wider text-[var(--ink-faint)]">
                Factuality: {selected.factuality}
              </p>
            )}
            {selected.fundingModel && (
              <p className="font-mono text-[7px] uppercase tracking-wider text-[var(--ink-faint)]">
                Funding: {selected.fundingModel}
              </p>
            )}
            {selected.description && (
              <p className="mt-1 font-mono text-[7px] leading-relaxed text-[var(--ink-light)]">
                {selected.description}
              </p>
            )}
          </div>
        </Html>
      )}

      <OrbitControls
        enableRotate={false}
        enablePan
        enableZoom
        minZoom={0.5}
        maxZoom={3}
      />
    </>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

interface FundingTreeProps {
  graph: FundingGraph;
}

export function FundingTree({ graph }: FundingTreeProps) {
  if (graph.nodes.length === 0) return null;

  return (
    <section className="mb-8 border-t border-[var(--rule-light)] pt-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-mono text-[10px] font-bold uppercase tracking-[0.24em] text-[var(--ink)]">
          Funding Tree
        </h2>
        <span className="font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
          {graph.nodes.length} entities &middot; {graph.edges.length} links
        </span>
      </div>
      <p className="mb-3 font-mono text-[8px] uppercase tracking-wider text-[var(--ink-faint)]">
        Who funds the media that created this story &mdash; click nodes for details
      </p>

      <div
        className="w-full overflow-hidden border border-[var(--rule-light)] bg-[var(--paper)]"
        style={{ height: "320px" }}
      >
        <Canvas
          orthographic
          camera={{ zoom: 60, position: [0, 0, 10] }}
          style={{ background: "transparent" }}
        >
          <TreeScene graph={graph} />
        </Canvas>
      </div>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap gap-3 font-mono text-[7px] uppercase tracking-wider text-[var(--ink-faint)]">
        {(
          [
            ["conglomerate", "Conglomerate"],
            ["state", "State"],
            ["owner", "Owner"],
            ["funder", "Funder"],
            ["source", "Source"],
          ] as const
        ).map(([type, label]) => (
          <span key={type} className="flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ backgroundColor: NODE_COLORS[type] }}
            />
            {label}
          </span>
        ))}
      </div>
    </section>
  );
}
