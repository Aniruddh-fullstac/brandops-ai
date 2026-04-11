import { useCampaignStore } from "../components/CampaignStore";
import { SourceFootnotes } from "../components/presentation/SourceFootnotes";
import { StructuredData } from "../components/presentation/StructuredData";
import { collectSources, sourceMatchers } from "../lib/traceSources";
import { Swords, Target } from "lucide-react";

/** LLM output may return differentiators as a string, single value, or array. */
function asStringList(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string") {
    const parts = v.split(/\n|•|;/).map((s) => s.trim()).filter(Boolean);
    return parts.length ? parts : [v];
  }
  return [String(v)];
}

export default function CompetitorAnalysis() {
  const { artifacts, hydrateLoading, steps } = useCampaignStore();
  const landscape = (artifacts as { competitor_landscape?: Record<string, unknown> }).competitor_landscape;
  const competitors = (landscape as { competitors?: { name: string; positioning: string; differentiators?: string[]; threat_level?: string }[] })
    ?.competitors;

  const src = collectSources(steps, (s) => sourceMatchers.researchCompetitor(s) || sourceMatchers.strategy(s));

  if (hydrateLoading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-16 text-center text-sm text-slate-500">Loading competitor data…</div>
    );
  }

  const opportunities = (landscape as { white_space_opportunities?: string[] })?.white_space_opportunities;
  const restLandscape = landscape
    ? Object.fromEntries(
        Object.entries(landscape).filter(([k]) => !["competitors", "white_space_opportunities"].includes(k))
      )
    : {};

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Competitor Analysis</h1>
        <p className="mt-1 text-sm text-slate-600">Landscape, differentiation, and gaps — with research sources.</p>
      </div>

      {competitors && competitors.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {competitors.map((c, i) => {
            const differentiators = asStringList((c as { differentiators?: unknown }).differentiators);
            return (
            <div key={i} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <Swords size={16} className="text-indigo-600" />
                <h3 className="font-semibold text-slate-900">{c.name}</h3>
              </div>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{c.positioning}</p>
              {differentiators.length > 0 && (
                <div className="mt-3">
                  <p className="text-[10px] font-bold uppercase text-slate-400">Differentiators</p>
                  <ul className="mt-1.5 space-y-1">
                    {differentiators.map((d, j) => (
                      <li key={j} className="text-xs text-slate-700">
                        · {d}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {c.threat_level && (
                <div className="mt-4">
                  <span
                    className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
                      c.threat_level === "high"
                        ? "bg-rose-100 text-rose-700"
                        : c.threat_level === "medium"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-teal-100 text-teal-700"
                    }`}
                  >
                    {c.threat_level} threat
                  </span>
                </div>
              )}
            </div>
            );
          })}
        </div>
      ) : landscape && Object.keys(landscape).length > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <StructuredData value={landscape} />
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <Swords className="mx-auto text-slate-300" size={40} />
          <p className="mt-3 text-sm text-slate-500">Run a campaign to see competitor intelligence.</p>
        </div>
      )}

      {opportunities && opportunities.length > 0 && (
        <div className="rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50/50 to-white p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <Target size={18} className="text-teal-600" />
            <h2 className="font-display text-lg font-semibold text-slate-900">White space opportunities</h2>
          </div>
          <ul className="space-y-2">
            {opportunities.map((o, i) => (
              <li key={i} className="flex gap-2 text-sm leading-relaxed text-slate-700">
                <span className="text-teal-500">→</span>
                {o}
              </li>
            ))}
          </ul>
        </div>
      )}

      {Object.keys(restLandscape).length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-slate-900">Additional landscape signals</h2>
          <div className="mt-4">
            <StructuredData value={restLandscape} />
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-4">
        <SourceFootnotes sources={src} />
      </div>
    </div>
  );
}
