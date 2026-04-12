import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MindWebGraph } from "./MindWebGraph";
import { GRAPH_PIPELINE } from "../../workflowConfig";
import type { AgentActivity, TraceStep } from "../../types";
import type { AgentNodeData, AgentStatus } from "./types";
import {
  DEPENDENCIES,
  getActiveNodeIdsFromSteps,
  getNodeIdForPhase,
  getStepsForNode,
  mergeStepFindings,
} from "./graphHelpers";
import { Maximize2, Minimize2, Network } from "lucide-react";

type Props = {
  graphNodesDone: Set<string>;
  busy: boolean;
  /** All graph nodes finished (server may still be persisting). */
  pipelineGraphComplete?: boolean;
  steps: TraceStep[];
  activities: AgentActivity[];
  onExpand: () => void;
};

export function MindWebMini({ graphNodesDone, busy, pipelineGraphComplete, steps, activities, onExpand }: Props) {
  const [expanded, setExpanded] = useState(false);
  const doneCnt = GRAPH_PIPELINE.filter((n) => graphNodesDone.has(n.id)).length;
  const hasCampaign = doneCnt > 0;
  const graphComplete =
    pipelineGraphComplete ?? (GRAPH_PIPELINE.length > 0 && doneCnt === GRAPH_PIPELINE.length);

  const activeNodeIds = useMemo(
    () => getActiveNodeIdsFromSteps(steps, graphNodesDone),
    [steps, graphNodesDone]
  );

  const agents: AgentNodeData[] = useMemo(
    () =>
      GRAPH_PIPELINE.map((node) => {
        let status: AgentStatus = "idle";
        if (graphNodesDone.has(node.id)) status = "complete";
        else if (activeNodeIds.has(node.id) || (busy && doneCnt > 0 && GRAPH_PIPELINE[doneCnt]?.id === node.id)) status = "loading";

        const phaseSteps = getStepsForNode(node.id, steps);
        const latest = phaseSteps[phaseSteps.length - 1];
        const allSources = phaseSteps.flatMap((s) => s.sources || []);
        const allQueries = phaseSteps.flatMap((s) => s.web_queries || []);
        const allTools = [...new Set(phaseSteps.flatMap((s) => (s.tool_calls || []).map((t) => t.name)))];
        const allToolCalls = phaseSteps.flatMap((s) => s.tool_calls || []);
        const nodeActivities = activities.filter((a) => {
          const mapped = getNodeIdForPhase(a.phase);
          return mapped === node.id || a.phase === node.id;
        });

        return {
          id: node.id, name: node.label, sub: node.sub, status, icon: node.icon,
          dependencies: DEPENDENCIES[node.id] || [],
          liveTitle: latest?.title,
          liveSummary: mergeStepFindings(phaseSteps),
          liveQueries: allQueries.length > 0 ? allQueries : undefined,
          liveSources: allSources.length > 0 ? allSources : undefined,
          liveTools: allTools.length > 0 ? allTools : undefined,
          liveToolCalls: allToolCalls.length > 0 ? allToolCalls : undefined,
          liveActivities: nodeActivities.length > 0 ? nodeActivities : undefined,
        };
      }),
    [graphNodesDone, activeNodeIds, busy, doneCnt, steps, activities]
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
            {busy && !graphComplete
              ? `${doneCnt}/${GRAPH_PIPELINE.length} running...`
              : busy && graphComplete
                ? `${doneCnt}/${GRAPH_PIPELINE.length} finalizing...`
                : `${doneCnt}/${GRAPH_PIPELINE.length} completed`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!expanded && (
            <div className="flex gap-0.5">
              {GRAPH_PIPELINE.map((n) => (
                <div key={n.id} className={`h-1.5 w-1.5 rounded-full transition-colors ${
                  graphNodesDone.has(n.id) ? "bg-teal-400" : activeNodeIds.has(n.id) ? "bg-indigo-400 animate-pulse" : "bg-slate-200"
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
