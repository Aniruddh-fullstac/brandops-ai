import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MindWebGraph } from "./MindWebGraph";
import { GRAPH_PIPELINE } from "../../workflowConfig";
import type { TraceStep } from "../../types";
import type { AgentNodeData, AgentStatus } from "./types";
import { DEPENDENCIES, getStepsForNode } from "./graphHelpers";
import { Maximize2, Minimize2, Network } from "lucide-react";

type Props = {
  graphNodesDone: Set<string>;
  busy: boolean;
  steps: TraceStep[];
  onExpand: () => void;
};

export function MindWebMini({ graphNodesDone, busy, steps, onExpand }: Props) {
  const [expanded, setExpanded] = useState(false);
  const doneCnt = GRAPH_PIPELINE.filter((n) => graphNodesDone.has(n.id)).length;
  const hasCampaign = doneCnt > 0;

  const activePhases = useMemo(
    () => new Set(steps.filter((s) => !graphNodesDone.has(s.phase)).map((s) => s.phase)),
    [steps, graphNodesDone]
  );

  const agents: AgentNodeData[] = useMemo(
    () =>
      GRAPH_PIPELINE.map((node) => {
        let status: AgentStatus = "idle";
        if (graphNodesDone.has(node.id)) status = "complete";
        else if (activePhases.has(node.id) || (busy && doneCnt > 0 && GRAPH_PIPELINE[doneCnt]?.id === node.id)) status = "loading";

        const phaseSteps = getStepsForNode(node.id, steps);
        const latest = phaseSteps[phaseSteps.length - 1];
        const allSources = phaseSteps.flatMap((s) => s.sources || []);
        const allQueries = phaseSteps.flatMap((s) => s.web_queries || []);
        const allTools = [...new Set(phaseSteps.flatMap((s) => (s.tool_calls || []).map((t) => t.name)))];

        return {
          id: node.id, name: node.label, sub: node.sub, status, icon: node.icon,
          dependencies: DEPENDENCIES[node.id] || [],
          liveTitle: latest?.title,
          liveSummary: latest?.summary || latest?.reasoning || undefined,
          liveQueries: allQueries.length > 0 ? allQueries : undefined,
          liveSources: allSources.length > 0 ? allSources : undefined,
          liveTools: allTools.length > 0 ? allTools : undefined,
        };
      }),
    [graphNodesDone, activePhases, busy, doneCnt, steps]
  );

  if (!hasCampaign) return null;

  return (
    <div className="anim-fade-up overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-slate-800 to-slate-900 text-white shadow-sm">
          <Network size={14} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-slate-800">Agent Network</p>
          <p className="text-[10px] text-slate-400">
            {busy ? `${doneCnt}/${GRAPH_PIPELINE.length} running...` : `${doneCnt}/${GRAPH_PIPELINE.length} completed`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!expanded && (
            <div className="flex gap-0.5">
              {GRAPH_PIPELINE.map((n) => (
                <div key={n.id} className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  graphNodesDone.has(n.id) ? "bg-teal-400" : activePhases.has(n.id) ? "bg-indigo-400 animate-pulse" : "bg-slate-200"
                }`} />
              ))}
            </div>
          )}
          {expanded ? <Minimize2 size={14} className="text-slate-400" /> : <Maximize2 size={14} className="text-slate-400" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-slate-100 bg-gradient-to-b from-slate-900 to-slate-800 px-2 py-3 overflow-hidden">
              <MindWebGraph agents={agents} width={500} height={340} />
              <button
                onClick={onExpand}
                className="mx-auto mt-2 flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-[10px] font-medium text-white/50 transition hover:bg-white/10 hover:text-white/80"
              >
                <Maximize2 size={10} />
                Full screen
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
