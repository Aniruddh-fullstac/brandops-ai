import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MindWebGraph } from "./MindWebGraph";
import { GRAPH_PIPELINE } from "../../workflowConfig";
import type { TraceStep } from "../../types";
import type { AgentNodeData, AgentStatus } from "./types";
import { Minimize2, RotateCcw } from "lucide-react";

type Props = {
  visible: boolean;
  graphNodesDone: Set<string>;
  busy: boolean;
  steps: TraceStep[];
  completedCount: number;
  totalCount: number;
  onMinimize: () => void;
};

const DEPENDENCIES: Record<string, string[]> = {
  ingest: [],
  brand_fetch: ["ingest"],
  parallel_research: ["brand_fetch"],
  strategy: ["parallel_research"],
  creatives: ["strategy"],
  critic: ["creatives"],
  refine: ["critic"],
  post_critic_parallel: ["refine"],
  parallel_schedule_bundle: ["post_critic_parallel"],
  finalize: ["parallel_schedule_bundle"],
};

/** Build agent nodes — only show agents that are triggered (loading/complete), not idle future ones */
function buildAgents(
  done: Set<string>,
  steps: TraceStep[],
  busy: boolean,
  doneCnt: number
): AgentNodeData[] {
  const activePhases = new Set(steps.filter((s) => !done.has(s.phase)).map((s) => s.phase));

  return GRAPH_PIPELINE.map((node) => {
    let status: AgentStatus = "idle";
    if (done.has(node.id)) {
      status = "complete";
    } else if (
      activePhases.has(node.id) ||
      (busy && doneCnt > 0 && GRAPH_PIPELINE[doneCnt]?.id === node.id)
    ) {
      status = "loading";
    }

    // Find the LATEST trace step for this phase to get brand-specific info
    const phaseSteps = steps.filter((s) => s.phase === node.id);
    const latestStep = phaseSteps[phaseSteps.length - 1];

    // Aggregate all sources and queries from all steps in this phase
    const allSources = phaseSteps.flatMap((s) => s.sources || []);
    const allQueries = phaseSteps.flatMap((s) => s.web_queries || []);
    const allTools = phaseSteps.flatMap((s) => (s.tool_calls || []).map((t) => t.name));
    const uniqueTools = [...new Set(allTools)];

    return {
      id: node.id,
      name: node.label,
      sub: node.sub,
      status,
      icon: node.icon,
      dependencies: DEPENDENCIES[node.id] || [],
      liveTitle: latestStep?.title,
      liveSummary: latestStep?.summary || latestStep?.reasoning || undefined,
      liveQueries: allQueries.length > 0 ? allQueries : undefined,
      liveSources: allSources.length > 0 ? allSources : undefined,
      liveTools: uniqueTools.length > 0 ? uniqueTools : undefined,
    };
  });
}

/** Floating particles */
function Particles() {
  const particles = useMemo(() =>
    Array.from({ length: 50 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      size: Math.random() * 2.5 + 0.5,
      dur: Math.random() * 25 + 15,
      delay: Math.random() * 12,
    })), []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-indigo-400/15"
          style={{ width: p.size, height: p.size, left: `${p.x}%`, top: `${p.y}%` }}
          animate={{ y: [0, -40, 0], opacity: [0.05, 0.3, 0.05] }}
          transition={{ duration: p.dur, repeat: Infinity, delay: p.delay, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

export function MindWebLoader({
  visible,
  graphNodesDone,
  busy,
  steps,
  completedCount,
  totalCount,
  onMinimize,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 900, h: 600 });
  const [replayKey, setReplayKey] = useState(0);

  useEffect(() => {
    const update = () => {
      setDims({
        w: window.innerWidth,
        h: window.innerHeight - 100, // header + footer
      });
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const agents = useMemo(
    () => buildAgents(graphNodesDone, steps, busy, completedCount),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [graphNodesDone, steps, busy, completedCount, replayKey]
  );

  const pct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const allDone = completedCount === totalCount && totalCount > 0 && !busy;
  const visibleCount = agents.filter((a) => a.status !== "idle").length;

  const handleReplay = useCallback(() => {
    setReplayKey((k) => k + 1);
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          ref={containerRef}
          className="fixed inset-0 z-50 flex flex-col"
          style={{ background: "linear-gradient(145deg, #050810 0%, #0B0F1A 30%, #111827 60%, #0c1222 100%)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.4 }}
        >
          <Particles />

          {/* ── Top bar ── */}
          <div className="relative z-10 flex items-center justify-between px-6 py-4">
            {/* Left: title + progress */}
            <div className="flex items-center gap-4">
              <div>
                <h2 className="text-sm font-bold text-white/90">
                  {allDone ? "Campaign Network Complete" : "Orchestrating AI Agents"}
                </h2>
                <p className="text-[11px] text-slate-500">
                  {allDone
                    ? `All ${totalCount} agents finished`
                    : `${visibleCount} agent${visibleCount !== 1 ? "s" : ""} active \u00B7 ${completedCount}/${totalCount} complete`}
                </p>
              </div>
              {/* Progress pill */}
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-32 overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-teal-400"
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                  />
                </div>
                <span className="text-[10px] font-bold tabular-nums text-slate-500">{pct}%</span>
              </div>
            </div>

            {/* Right: action buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleReplay}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/60 transition-all hover:bg-white/10 hover:text-white/90"
                title="Replay animation"
              >
                <RotateCcw size={12} />
                Replay
              </button>
              <button
                onClick={onMinimize}
                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/60 transition-all hover:bg-white/10 hover:text-white/90"
                title="Minimize to dashboard"
              >
                <Minimize2 size={12} />
                Minimize
              </button>
            </div>
          </div>

          {/* ── Graph area ── */}
          <div className="relative z-10 flex-1 px-4">
            <MindWebGraph
              key={replayKey}
              agents={agents}
              width={dims.w}
              height={dims.h}
            />
          </div>

          {/* ── Bottom status bar ── */}
          <div className="relative z-10 flex items-center justify-center gap-3 px-6 py-3">
            {GRAPH_PIPELINE.map((n) => {
              const done = graphNodesDone.has(n.id);
              const active = agents.find((a) => a.id === n.id)?.status === "loading";
              return (
                <div key={n.id} className="flex items-center gap-1.5">
                  <div className={`h-2 w-2 rounded-full transition-all ${
                    done ? "bg-teal-400" : active ? "bg-indigo-400 animate-pulse" : "bg-white/10"
                  }`} />
                  <span className={`text-[9px] font-medium ${
                    done ? "text-teal-400/80" : active ? "text-indigo-400/80" : "text-white/15"
                  }`}>
                    {n.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Completion burst effect */}
          <AnimatePresence>
            {allDone && (
              <motion.div
                className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              >
                <motion.div
                  className="rounded-full border border-teal-400/20"
                  initial={{ width: 0, height: 0, opacity: 0.5 }}
                  animate={{ width: 500, height: 500, opacity: 0 }}
                  transition={{ duration: 2, ease: "easeOut" }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
