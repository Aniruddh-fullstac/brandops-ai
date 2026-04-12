import { useCampaignStore } from "../components/CampaignStore";
import { SourceFootnotes } from "../components/presentation/SourceFootnotes";
import { Bell, TrendingUp, AlertTriangle, Radio } from "lucide-react";
import type { TraceStep } from "../types";

function StepCard({ s }: { s: TraceStep }) {
  const src = (s.sources || []).filter((x) => x.url);
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-md transition hover:border-indigo-200/60 hover:shadow-lg">
      <div className="h-0.5 w-full bg-gradient-to-r from-indigo-500 to-violet-500" />
      <div className="p-5">
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <TrendingUp size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-display text-sm font-bold text-slate-900">{s.title}</p>
            {s.summary && <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.summary}</p>}
            {s.web_queries && s.web_queries.length > 0 && (
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
                <span className="font-semibold text-slate-600">Searched:</span> {s.web_queries.slice(0, 4).join(" · ")}
              </p>
            )}
            {src.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <SourceFootnotes sources={src} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Notifications() {
  const { steps, artifacts } = useCampaignStore();
  const sim = (artifacts as { performance_sim?: { key_risks?: string[]; optimization_suggestions?: string[] } }).performance_sim;
  const trendSteps = steps.filter((s) => s.agent === "market_trends" || s.phase === "research");
  const riskCount = sim?.key_risks?.length ?? 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50/90 to-white pb-16">
      <div className="border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto max-w-4xl px-6 py-10">
          <p className="text-[11px] font-bold uppercase tracking-widest text-amber-600">Signals</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-slate-900">Trend alerts</h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
            Research highlights and simulation risks — each card links back to sources when available.
          </p>
          {(riskCount > 0 || trendSteps.length > 0) && (
            <div className="mt-6 flex flex-wrap gap-3">
              {riskCount > 0 && (
                <span className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-900">
                  <AlertTriangle size={14} />
                  {riskCount} risk{riskCount !== 1 ? "s" : ""}
                </span>
              )}
              {trendSteps.length > 0 && (
                <span className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 shadow-sm">
                  <Radio size={14} className="text-indigo-500" />
                  {trendSteps.length} research signal{trendSteps.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-4xl space-y-5 px-6 pt-10">
        {sim?.key_risks?.map((r, i) => (
          <div
            key={`risk-${i}`}
            className="overflow-hidden rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/90 to-orange-50/40 shadow-md"
          >
            <div className="flex items-start gap-4 p-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-md">
                <AlertTriangle size={20} />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-900/90">Risk from simulation</p>
                <p className="mt-2 text-sm font-medium leading-relaxed text-amber-950">{r}</p>
              </div>
            </div>
          </div>
        ))}

        {trendSteps.map((s) => (
          <StepCard key={s.id} s={s} />
        ))}

        {!trendSteps.length && !sim?.key_risks?.length && (
          <div className="rounded-2xl border border-slate-200 bg-white p-14 text-center shadow-md">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
              <Bell className="text-slate-400" size={32} />
            </div>
            <p className="mt-4 text-sm font-medium text-slate-700">No alerts yet</p>
            <p className="mt-1 text-xs text-slate-500">Trend research and performance risks will land here after a run.</p>
          </div>
        )}
      </div>
    </div>
  );
}
