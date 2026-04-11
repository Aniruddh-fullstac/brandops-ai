import { GRAPH_PIPELINE } from "../workflowConfig";
import type { TraceStep } from "../types";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";

type Props = {
  busy: boolean;
  graphNodesDone: Set<string>;
  steps: TraceStep[];
  runId: string | null;
};

export function WorkflowViz({ busy, graphNodesDone, steps, runId }: Props) {
  const doneSet = graphNodesDone;
  const total = GRAPH_PIPELINE.length;
  const doneCnt = GRAPH_PIPELINE.filter((n) => doneSet.has(n.id)).length;
  const pct = total > 0 ? Math.round((doneCnt / total) * 100) : 0;
  const activePhases = new Set(steps.filter((s) => !doneSet.has(s.phase)).map((s) => s.phase));

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold text-slate-900">Multi-Agent Workflow</h2>
        {runId && <span className="font-mono text-[10px] text-slate-400">{runId}</span>}
      </div>
      <p className="mt-1 text-xs text-slate-500">
        {total} agents orchestrated via LangGraph. Conditional refinement if critic scores low.
      </p>

      {/* Progress bar */}
      <div className="mt-4 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-teal-400 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-slate-500">{pct}% · {doneCnt}/{total} nodes</p>

      {/* Pipeline steps */}
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7">
        {GRAPH_PIPELINE.map((node) => {
          const done = doneSet.has(node.id);
          const active = !done && (activePhases.has(node.id) || (busy && doneCnt > 0 && !done && GRAPH_PIPELINE[doneCnt]?.id === node.id));
          return (
            <div
              key={node.id}
              className={`flex flex-col items-center rounded-xl border p-2.5 transition ${
                done
                  ? "border-teal-200 bg-teal-50"
                  : active
                    ? "border-indigo-300 bg-indigo-50 shadow-sm shadow-indigo-200/50"
                    : "border-slate-100 bg-slate-50 opacity-60"
              }`}
            >
              {done ? (
                <CheckCircle2 size={18} className="text-teal-600" />
              ) : active ? (
                <Loader2 size={18} className="animate-spin text-indigo-600" />
              ) : (
                <Circle size={18} className="text-slate-300" />
              )}
              <span className="mt-1 text-center text-[10px] font-bold text-slate-800">{node.label}</span>
              <span className="text-center text-[8px] text-slate-500">{node.sub}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
