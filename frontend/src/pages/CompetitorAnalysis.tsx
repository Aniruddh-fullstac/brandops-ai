import { useCampaignStore } from "../components/CampaignStore";
import { Swords } from "lucide-react";

export default function CompetitorAnalysis() {
  const { artifacts, hydrateLoading } = useCampaignStore();
  const landscape = (artifacts as { competitor_landscape?: Record<string, unknown> }).competitor_landscape;
  const competitors = (landscape as { competitors?: { name: string; positioning: string; differentiators: string[]; threat_level: string }[] })?.competitors;

  if (hydrateLoading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-16 text-center text-sm text-slate-500">Loading competitor data…</div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Competitor Analysis</h1>
        <p className="mt-1 text-sm text-slate-600">
          Competitive landscape with positioning gaps and strategic opportunities.
        </p>
      </div>

      {competitors && competitors.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {competitors.map((c, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-2">
                <Swords size={16} className="text-indigo-600" />
                <h3 className="font-semibold text-slate-900">{c.name}</h3>
              </div>
              <p className="mt-2 text-sm text-slate-600">{c.positioning}</p>
              {c.differentiators && (
                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase text-slate-400">Differentiators</p>
                  <ul className="mt-1 space-y-1">
                    {c.differentiators.map((d, j) => (
                      <li key={j} className="text-xs text-slate-600">• {d}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="mt-3">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
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
            </div>
          ))}
        </div>
      ) : landscape ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <pre className="max-h-[500px] overflow-auto rounded-xl bg-slate-50 p-4 text-xs text-slate-700">
            {JSON.stringify(landscape, null, 2)}
          </pre>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <Swords className="mx-auto text-slate-300" size={40} />
          <p className="mt-3 text-sm text-slate-500">Run a campaign to see competitor intelligence.</p>
        </div>
      )}

      {landscape && (landscape as { white_space_opportunities?: string[] }).white_space_opportunities && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-slate-900">White Space Opportunities</h2>
          <ul className="mt-3 space-y-2">
            {((landscape as { white_space_opportunities: string[] }).white_space_opportunities).map((o, i) => (
              <li key={i} className="flex gap-2 text-sm text-slate-700">
                <span className="text-teal-500">→</span> {o}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
