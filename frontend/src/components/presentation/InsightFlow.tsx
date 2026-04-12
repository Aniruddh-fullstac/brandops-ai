import type { ReactNode } from "react";
import { Play, Database, Target } from "lucide-react";
import { SourceFootnotes } from "./SourceFootnotes";
import type { SourceRef } from "../../lib/traceSources";

/**
 * Three-part narrative: actions → evidence → takeaway.
 * Replaces long structured dumps on Market Insights.
 */
export function InsightFlow({
  whatWeDid,
  collected,
  outcome,
  citationSources,
  methodologyNote,
  emptyMessage,
}: {
  whatWeDid: string[];
  collected: ReactNode;
  outcome: ReactNode;
  /** Citations placed directly under the insight outcome text. */
  citationSources?: SourceRef[];
  /** e.g. how a metric was produced (audience segmentation). */
  methodologyNote?: string;
  /** When there’s nothing to show yet */
  emptyMessage?: string;
}) {
  if (emptyMessage && whatWeDid.length === 0 && !collected && !outcome) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3">
        <div className="flex items-center gap-2 text-slate-500">
          <Play size={14} className="shrink-0 text-indigo-500" />
          <span className="text-[10px] font-bold uppercase tracking-widest">What we ran</span>
        </div>
        {whatWeDid.length > 0 ? (
          <ul className="mt-2 space-y-1.5 pl-1 text-xs leading-snug text-slate-700">
            {whatWeDid.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-medium text-indigo-400">·</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-slate-400">No trace steps matched yet.</p>
        )}
      </div>

      <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 text-slate-500">
          <Database size={14} className="shrink-0 text-teal-600" />
          <span className="text-[10px] font-bold uppercase tracking-widest">What we gathered</span>
        </div>
        <div className="mt-2 text-xs leading-relaxed text-slate-600">{collected}</div>
      </div>

      <div className="rounded-xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/90 via-white to-violet-50/40 px-4 py-4 shadow-sm">
        <div className="flex items-center gap-2 text-indigo-700">
          <Target size={15} className="shrink-0" />
          <span className="text-[10px] font-bold uppercase tracking-widest">Insight outcome</span>
        </div>
        <div className="mt-3 text-sm leading-relaxed text-slate-800">{outcome}</div>
        {citationSources && citationSources.length > 0 && (
          <SourceFootnotes
            sources={citationSources}
            variant="inline"
            className="border-t border-indigo-100/90 !mt-3 !pt-3"
          />
        )}
        {methodologyNote && (
          <p className="mt-3 text-[10px] leading-relaxed text-slate-500 border-t border-indigo-100/60 pt-3">
            {methodologyNote}
          </p>
        )}
      </div>
    </div>
  );
}
