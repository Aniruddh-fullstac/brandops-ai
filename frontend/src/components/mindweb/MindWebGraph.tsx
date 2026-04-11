import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AgentNode } from "./AgentNode";
import { ConnectionEdge } from "./ConnectionEdge";
import type { AgentNodeData } from "./types";
import { ExternalLink, X } from "lucide-react";

type Props = {
  agents: AgentNodeData[];
  width: number;
  height: number;
};

type LayoutNode = AgentNodeData & { x: number; y: number };

/**
 * Seeded pseudo-random for deterministic but organic-looking positions.
 * Each node gets a unique but stable "random" offset.
 */
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

/**
 * Spider-web layout — places nodes in a randomized radial pattern.
 * - Center node at the middle
 * - Other nodes spread outward with jittered angles and varied radii
 * - Only shows non-idle nodes
 * - Ensures no node is clipped by keeping a safe margin
 */
function computeLayout(agents: AgentNodeData[], w: number, h: number): LayoutNode[] {
  const visible = agents.filter((a) => a.status !== "idle");
  if (visible.length === 0) return [];

  const cx = w / 2;
  const cy = h / 2;
  const margin = 55; // keep nodes away from edges
  const maxRx = (w / 2) - margin;
  const maxRy = (h / 2) - margin;

  if (visible.length === 1) {
    return [{ ...visible[0], x: cx, y: cy }];
  }

  const result: LayoutNode[] = [];

  // First node always at center
  result.push({ ...visible[0], x: cx, y: cy });

  // Remaining nodes in an organic radial spread
  const rest = visible.slice(1);
  const count = rest.length;

  for (let i = 0; i < count; i++) {
    const agent = rest[i];
    const seedBase = i * 7 + 3;

    // Base angle evenly spaced, then jittered
    const baseAngle = (i / count) * 2 * Math.PI - Math.PI / 2;
    const angleJitter = (seededRandom(seedBase) - 0.5) * 0.6; // +/- ~17 degrees
    const angle = baseAngle + angleJitter;

    // Radius varies: inner ring vs outer ring with randomness
    // Distribute across 2-3 "rings" organically
    const ringBase = count <= 4 ? 0.55 : (i % 3 === 0 ? 0.4 : i % 3 === 1 ? 0.65 : 0.85);
    const radiusJitter = (seededRandom(seedBase + 1) - 0.5) * 0.2;
    const radiusFactor = Math.max(0.3, Math.min(0.95, ringBase + radiusJitter));

    const x = cx + Math.cos(angle) * maxRx * radiusFactor;
    const y = cy + Math.sin(angle) * maxRy * radiusFactor;

    // Clamp to safe area
    result.push({
      ...agent,
      x: Math.max(margin, Math.min(w - margin, x)),
      y: Math.max(margin, Math.min(h - margin, y)),
    });
  }

  return result;
}

function computeEdges(nodes: LayoutNode[]) {
  const pos = new Map(nodes.map((n) => [n.id, n]));
  const edges: {
    from: string; to: string;
    fromX: number; fromY: number; toX: number; toY: number;
    status: "idle" | "active" | "complete";
  }[] = [];

  for (const node of nodes) {
    for (const dep of node.dependencies) {
      const f = pos.get(dep);
      const t = pos.get(node.id);
      if (!f || !t) continue;
      const done = f.status === "complete" && t.status === "complete";
      const active = f.status === "loading" || t.status === "loading";
      edges.push({
        from: dep, to: node.id,
        fromX: f.x, fromY: f.y, toX: t.x, toY: t.y,
        status: done ? "complete" : active ? "active" : "idle",
      });
    }
  }
  return edges;
}

/** Info panel — floats as overlay, doesn't shift the graph */
function InfoPanel({ node, onClose }: { node: AgentNodeData; onClose: () => void }) {
  const Icon = node.icon;

  return (
    <motion.div
      className="absolute right-5 top-5 z-20 w-72"
      initial={{ opacity: 0, y: -10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
    >
      <div className="rounded-2xl border border-white/10 bg-black/60 p-4 backdrop-blur-2xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-3">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${
            node.status === "loading" ? "bg-indigo-500/25" : "bg-teal-500/25"
          }`}>
            <Icon size={15} color={node.status === "loading" ? "#818cf8" : "#4ade80"} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[13px] font-bold text-white">{node.name}</h3>
            <p className="text-[10px] text-slate-500">{node.sub}</p>
          </div>
          <div className="flex items-center gap-2">
            {node.status === "loading" && (
              <span className="flex items-center gap-1 rounded-full bg-indigo-500/20 px-2 py-0.5 text-[8px] font-bold text-indigo-300 uppercase tracking-wider">
                <motion.span className="h-1.5 w-1.5 rounded-full bg-indigo-400"
                  animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 1, repeat: Infinity }} />
                Live
              </span>
            )}
            <button onClick={onClose} className="rounded-md p-0.5 text-slate-500 hover:text-white transition-colors">
              <X size={12} />
            </button>
          </div>
        </div>

        {/* Task — brand specific */}
        {node.liveTitle && (
          <div className="mb-2.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-0.5">Task</p>
            <p className="text-[11px] font-semibold text-white/90 leading-snug">{node.liveTitle}</p>
          </div>
        )}

        {/* Findings — brand specific */}
        {node.liveSummary && (
          <motion.div className="mb-2.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-0.5">Findings</p>
            <p className="text-[10px] leading-relaxed text-slate-400 line-clamp-4">{node.liveSummary}</p>
          </motion.div>
        )}

        {/* Web queries — brand specific */}
        {node.liveQueries && node.liveQueries.length > 0 && (
          <motion.div className="mb-2.5" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}>
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1">Searching</p>
            <div className="space-y-0.5">
              {node.liveQueries.slice(0, 4).map((q, i) => (
                <motion.div key={i} className="flex items-center gap-1.5 rounded bg-white/5 px-2 py-1"
                  initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.08 }}>
                  <span className="text-[9px]">&#128269;</span>
                  <span className="text-[9px] text-indigo-300 truncate">{q}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Tools */}
        {node.liveTools && node.liveTools.length > 0 && (
          <div className="mb-2.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1">Tools</p>
            <div className="flex flex-wrap gap-1">
              {node.liveTools.map((t, i) => (
                <span key={i} className="rounded bg-white/5 px-1.5 py-0.5 text-[8px] font-mono text-slate-500">{t}</span>
              ))}
            </div>
          </div>
        )}

        {/* Sources — brand specific URLs */}
        {node.liveSources && node.liveSources.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}>
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1">Sources</p>
            <div className="space-y-0.5">
              {node.liveSources.slice(0, 4).map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 text-[9px] text-indigo-400 hover:text-indigo-300 transition-colors">
                  <ExternalLink size={7} className="flex-shrink-0" />
                  <span className="truncate">
                    {s.title || (() => { try { return new URL(s.url).hostname; } catch { return s.url; } })()}
                  </span>
                </a>
              ))}
            </div>
          </motion.div>
        )}

        {/* No data yet — show waiting state */}
        {!node.liveTitle && !node.liveSummary && node.status === "loading" && (
          <div className="flex items-center gap-2 py-2">
            <motion.div className="h-1 w-1 rounded-full bg-indigo-400"
              animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1.2, repeat: Infinity }} />
            <p className="text-[10px] text-slate-500">Agent initializing...</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

export function MindWebGraph({ agents, width, height }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const nodes = useMemo(() => computeLayout(agents, width, height), [agents, width, height]);
  const edges = useMemo(() => computeEdges(nodes), [nodes]);

  // Auto-select currently loading agent, allow manual override
  const activeAgent = agents.find((a) => a.status === "loading");
  const displayId = selectedId || activeAgent?.id || null;
  const displayNode = displayId ? agents.find((a) => a.id === displayId) : null;

  const highlightedEdges = useMemo(() => {
    if (!displayId) return new Set<number>();
    const s = new Set<number>();
    edges.forEach((e, i) => { if (e.from === displayId || e.to === displayId) s.add(i); });
    return s;
  }, [displayId, edges]);

  return (
    <div className="relative" style={{ width, height }}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="select-none">
        <defs>
          <filter id="edgeGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <radialGradient id="centerGlow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#6C63FF" stopOpacity="0.04" />
            <stop offset="70%" stopColor="#6C63FF" stopOpacity="0.01" />
            <stop offset="100%" stopColor="#6C63FF" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Center atmosphere */}
        <circle cx={width / 2} cy={height / 2} r={Math.min(width, height) * 0.45} fill="url(#centerGlow)" />

        {/* Edges */}
        {edges.map((e, i) => (
          <ConnectionEdge key={`${e.from}-${e.to}`}
            x1={e.fromX} y1={e.fromY} x2={e.toX} y2={e.toY}
            status={e.status} index={i} highlighted={highlightedEdges.has(i)} />
        ))}

        {/* Nodes */}
        {nodes.map((n) => (
          <AgentNode key={n.id} node={n} x={n.x} y={n.y}
            isSelected={displayId === n.id}
            onSelect={setSelectedId} />
        ))}
      </svg>

      {/* Info panel overlay — top right, doesn't affect graph centering */}
      <AnimatePresence mode="wait">
        {displayNode && displayNode.status !== "idle" && (
          <InfoPanel key={displayNode.id} node={displayNode} onClose={() => setSelectedId(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
