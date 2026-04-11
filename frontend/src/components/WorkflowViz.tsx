import { GRAPH_PIPELINE } from "../workflowConfig";
import type { TraceStep } from "../types";
import { Check, Loader2 } from "lucide-react";
import { useState } from "react";

type Props = {
  busy: boolean;
  graphNodesDone: Set<string>;
  steps: TraceStep[];
  runId: string | null;
};

export function WorkflowViz({ busy, graphNodesDone, steps }: Props) {
  const total = GRAPH_PIPELINE.length;
  const doneCnt = GRAPH_PIPELINE.filter((n) => graphNodesDone.has(n.id)).length;
  const pct = total > 0 ? Math.round((doneCnt / total) * 100) : 0;
  const activePhases = new Set(
    steps.filter((s) => !graphNodesDone.has(s.phase)).map((s) => s.phase)
  );
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 hover:text-slate-900 transition-colors"
        >
          <span className={`transition-transform ${expanded ? "rotate-90" : ""}`}>&#9654;</span>
          Pipeline
          {busy && (
            <span className="ml-1 flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-medium text-indigo-600">
              <Loader2 size={9} className="animate-spin" />
              Running
            </span>
          )}
          {!busy && doneCnt === total && total > 0 && (
            <span className="ml-1 flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-700">
              <Check size={9} />
              Done
            </span>
          )}
        </button>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold tabular-nums text-slate-500">
          {doneCnt}/{total} &middot; {pct}%
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className="anim-progress h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-teal-400 transition-all duration-700 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Expanded timeline */}
      {expanded && (
        <div className="anim-fade-up grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 md:grid-cols-5">
          {GRAPH_PIPELINE.map((node, i) => {
            const done = graphNodesDone.has(node.id);
            const active =
              !done &&
              (activePhases.has(node.id) ||
                (busy && doneCnt > 0 && !done && GRAPH_PIPELINE[doneCnt]?.id === node.id));
            const Icon = node.icon;

            return (
              <div
                key={node.id}
                className={`anim-fade-up rounded-lg border p-2.5 transition-all duration-300 ${
                  done
                    ? "border-teal-200 bg-teal-50/70"
                    : active
                      ? "anim-pulse-glow border-indigo-200 bg-indigo-50/70"
                      : "border-slate-100 bg-slate-50/50 opacity-60"
                }`}
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                {/* Icon + status */}
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md ${
                      done
                        ? "bg-teal-500 text-white"
                        : active
                          ? "bg-indigo-500 text-white"
                          : "bg-slate-200 text-slate-400"
                    }`}
                  >
                    {done ? (
                      <Check size={12} strokeWidth={3} className="anim-check" />
                    ) : active ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <Icon size={11} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-[11px] font-bold leading-tight ${
                      done ? "text-teal-800" : active ? "text-indigo-800" : "text-slate-500"
                    }`}>
                      {node.label}
                    </p>
                    <p className="text-[9px] text-slate-400 leading-tight">{node.sub}</p>
                  </div>
                </div>

                {/* Description — always visible */}
                <p className={`mt-1.5 text-[10px] leading-snug ${
                  done ? "text-teal-600/80" : active ? "text-indigo-600/80" : "text-slate-400"
                }`}>
                  {node.description}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
