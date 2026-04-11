import { useCampaignStore } from "../components/CampaignStore";
import { SourceFootnotes } from "../components/presentation/SourceFootnotes";
import { Bell, TrendingUp, AlertTriangle } from "lucide-react";
import type { TraceStep } from "../types";

function StepCard({ s }: { s: TraceStep }) {
  const src = (s.sources || []).filter((x) => x.url);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <TrendingUp size={18} className="mt-0.5 shrink-0 text-indigo-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{s.title}</p>
          {s.summary && <p className="mt-1 text-sm text-slate-600">{s.summary}</p>}
          {s.web_queries && s.web_queries.length > 0 && (
            <p className="mt-2 text-[11px] text-slate-400">Searched: {s.web_queries.slice(0, 4).join(" · ")}</p>
          )}
          {src.length > 0 && (
            <div className="mt-3 border-t border-slate-100 pt-2">
              <SourceFootnotes sources={src} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Notifications() {
  const { steps, artifacts } = useCampaignStore();
  const sim = (artifacts as { performance_sim?: { key_risks?: string[]; optimization_suggestions?: string[] } }).performance_sim;
  const trendSteps = steps.filter((s) => s.agent === "market_trends" || s.phase === "research");

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Trend Alerts</h1>
        <p className="mt-1 text-sm text-slate-600">Signals from research agents and performance simulation — with citations.</p>
      </div>

      <div className="space-y-4">
        {sim?.key_risks?.map((r, i) => (
          <div key={`risk-${i}`} className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-500" />
            <div>
              <p className="text-sm font-semibold text-amber-900">Risk alert</p>
              <p className="mt-1 text-sm text-amber-800">{r}</p>
            </div>
          </div>
        ))}

        {trendSteps.map((s) => (
          <StepCard key={s.id} s={s} />
        ))}

        {!trendSteps.length && !sim?.key_risks?.length && (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
            <Bell className="mx-auto text-slate-300" size={40} />
            <p className="mt-3 text-sm text-slate-500">Trend alerts populate when research agents complete.</p>
          </div>
        )}
      </div>
    </div>
  );
}
