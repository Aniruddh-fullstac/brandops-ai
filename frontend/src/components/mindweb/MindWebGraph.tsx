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

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function computeLayout(agents: AgentNodeData[], w: number, h: number): LayoutNode[] {
  const visible = agents.filter((a) => a.status !== "idle");
  if (visible.length === 0) return [];
  const cx = w / 2;
  const cy = h / 2;
  const margin = 55;
  const maxRx = (w / 2) - margin;
  const maxRy = (h / 2) - margin;

  if (visible.length === 1) return [{ ...visible[0], x: cx, y: cy }];

  const result: LayoutNode[] = [{ ...visible[0], x: cx, y: cy }];
  const rest = visible.slice(1);

  for (let i = 0; i < rest.length; i++) {
    const seedBase = i * 7 + 3;
    const baseAngle = (i / rest.length) * 2 * Math.PI - Math.PI / 2;
    const angleJitter = (seededRandom(seedBase) - 0.5) * 0.6;
    const angle = baseAngle + angleJitter;
    const ringBase = rest.length <= 4 ? 0.55 : (i % 3 === 0 ? 0.4 : i % 3 === 1 ? 0.65 : 0.85);
    const radiusJitter = (seededRandom(seedBase + 1) - 0.5) * 0.2;
    const radiusFactor = Math.max(0.3, Math.min(0.95, ringBase + radiusJitter));
    result.push({
      ...rest[i],
      x: Math.max(margin, Math.min(w - margin, cx + Math.cos(angle) * maxRx * radiusFactor)),
      y: Math.max(margin, Math.min(h - margin, cy + Math.sin(angle) * maxRy * radiusFactor)),
    });
  }
  return result;
}

function computeEdges(nodes: LayoutNode[]) {
  const pos = new Map(nodes.map((n) => [n.id, n]));
  return nodes.flatMap((node) =>
    node.dependencies
      .filter((dep) => pos.has(dep))
      .map((dep) => {
        const f = pos.get(dep)!;
        const t = pos.get(node.id)!;
        const done = f.status === "complete" && t.status === "complete";
        const active = f.status === "loading" || t.status === "loading";
        return {
          from: dep, to: node.id,
          fromX: f.x, fromY: f.y, toX: t.x, toY: t.y,
          status: (done ? "complete" : active ? "active" : "idle") as "idle" | "active" | "complete",
        };
      })
  );
}

const ACTION_EMOJI: Record<string, string> = {
  fetching_url: "\u{1F310}",
  web_search: "\u{1F50D}",
  reddit_search: "\u{1F4AC}",
  llm_call: "\u{1F9E0}",
  reading_source: "\u{1F4D6}",
  generating_image: "\u{1F3A8}",
  analyzing: "\u{1F52C}",
  parsing: "\u{1F4CB}",
  configuring: "\u{2699}\u{FE0F}",
};

/** Info panel — shows live agent activity + results */
function InfoPanel({ node, onClose }: { node: AgentNodeData; onClose: () => void }) {
  const Icon = node.icon;
  const hasActivities = node.liveActivities && node.liveActivities.length > 0;
  const hasTraceData = node.liveTitle || node.liveSummary;
  const hasAnyData = hasActivities || hasTraceData || (node.liveQueries && node.liveQueries.length > 0);

  return (
    <motion.div
      className="absolute right-5 top-5 z-20 w-80"
      initial={{ opacity: 0, y: -10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
    >
      <div className="rounded-2xl border border-white/10 bg-black/70 p-4 backdrop-blur-2xl shadow-2xl max-h-[70vh] overflow-y-auto thin-scroll">
        {/* Header */}
        <div className="flex items-center gap-2.5 mb-3">
          <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
            node.status === "loading" ? "bg-indigo-500/25" : "bg-teal-500/25"
          }`}>
            <Icon size={15} color={node.status === "loading" ? "#818cf8" : "#4ade80"} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[13px] font-bold text-white">{node.name}</h3>
            <p className="text-[10px] text-slate-500">{node.sub}</p>
          </div>
          {node.status === "loading" && (
            <span className="flex items-center gap-1 rounded-full bg-indigo-500/20 px-2 py-0.5 text-[8px] font-bold text-indigo-300 uppercase tracking-wider">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
              Live
            </span>
          )}
          <button onClick={onClose} className="rounded-md p-0.5 text-slate-500 hover:text-white transition-colors">
            <X size={12} />
          </button>
        </div>

        {/* === ACTIVITY FEED — first, since it arrives before trace data === */}
        {hasActivities && (
          <div className="mb-3">
            <p className="text-[9px] font-bold uppercase tracking-widest text-indigo-400/80 mb-1.5">
              {node.status === "loading" ? "Agent Activity" : "What it did"}
            </p>
            <div className="space-y-1">
              {node.liveActivities!.map((act, i) => (
                <div
                  key={act.id}
                  className="flex items-start gap-2 rounded-lg bg-white/5 px-2.5 py-1.5 border border-white/5"
                >
                  <span className="text-[10px] mt-0.5 flex-shrink-0">
                    {ACTION_EMOJI[act.action] || "\u{2699}\u{FE0F}"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] text-slate-300 leading-snug">{act.detail}</p>
                    {act.url && (
                      <p className="text-[8px] text-indigo-400/60 truncate mt-0.5">{act.url}</p>
                    )}
                    {act.tool && (
                      <span className="inline-block mt-0.5 rounded bg-white/5 px-1 py-0.5 text-[7px] font-mono text-slate-500">
                        {act.tool}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Task title from trace */}
        {node.liveTitle && (
          <div className="mb-2.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-0.5">Result</p>
            <p className="text-[11px] font-semibold text-white/90 leading-snug">{node.liveTitle}</p>
          </div>
        )}

        {/* Findings from trace */}
        {node.liveSummary && (
          <div className="mb-2.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-0.5">Findings</p>
            <p className="text-[10px] leading-relaxed text-slate-400 line-clamp-4">{node.liveSummary}</p>
          </div>
        )}

        {/* Sources */}
        {node.liveSources && node.liveSources.length > 0 && (
          <div className="mb-2.5">
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-1">Sources</p>
            <div className="space-y-0.5">
              {node.liveSources.slice(0, 5).map((s, i) => (
                <a key={i} href={s.url} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 text-[9px] text-indigo-400 hover:text-indigo-300 transition-colors">
                  <ExternalLink size={7} className="flex-shrink-0" />
                  <span className="truncate">
                    {s.title || (() => { try { return new URL(s.url).hostname; } catch { return s.url; } })()}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Loading state when nothing has arrived yet */}
        {!hasAnyData && node.status === "loading" && (
          <div className="flex items-center gap-2.5 py-3">
            <div className="flex gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" />
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" style={{ animationDelay: "0.2s" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse" style={{ animationDelay: "0.4s" }} />
            </div>
            <p className="text-[10px] text-slate-500">Waiting for agent to start...</p>
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

  const activeAgent = agents.find((a) => a.status === "loading");
  const displayId = selectedId || activeAgent?.id || null;
  // Use the FULL agent data (not layout node) so we get latest activities
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
        <circle cx={width / 2} cy={height / 2} r={Math.min(width, height) * 0.45} fill="url(#centerGlow)" />

        {edges.map((e, i) => (
          <ConnectionEdge key={`${e.from}-${e.to}`}
            x1={e.fromX} y1={e.fromY} x2={e.toX} y2={e.toY}
            status={e.status} index={i} highlighted={highlightedEdges.has(i)} />
        ))}

        {nodes.map((n) => (
          <AgentNode key={n.id} node={n} x={n.x} y={n.y}
            isSelected={displayId === n.id}
            onSelect={setSelectedId} />
        ))}
      </svg>

      {/* Info panel — re-renders on every agents change (no AnimatePresence key blocking updates) */}
      {displayNode && displayNode.status !== "idle" && (
        <InfoPanel node={displayNode} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}
