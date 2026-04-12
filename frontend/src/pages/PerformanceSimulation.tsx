import { useCampaignStore } from "../components/CampaignStore";
import { KeywordGraphPanel } from "../components/presentation/KeywordGraphPanel";
import { SourceFootnotes } from "../components/presentation/SourceFootnotes";
import { StructuredData } from "../components/presentation/StructuredData";
import { collectSources, sourceMatchers } from "../lib/traceSources";
import { TrendingUp, AlertTriangle, Lightbulb, BarChart3, MousePointerClick, Users } from "lucide-react";

type ChannelSim = {
  name: string;
  impressions_estimate: number;
  engagement_rate: number;
  click_through_rate: number;
  estimated_leads: number;
  confidence: string;
};

type PerfData = {
  channels?: ChannelSim[];
  overall_projected_reach?: number;
  key_risks?: string[];
  optimization_suggestions?: string[];
  reasoning_summary?: string;
};

export default function PerformanceSimulation() {
  const { artifacts, hydrateLoading, steps } = useCampaignStore();
  const sim = (artifacts as { performance_sim?: PerfData & Record<string, unknown> }).performance_sim;
  const kgraph = (
    artifacts as {
      keyword_graph?: {
        top_keywords?: { keyword: string; score: number }[];
        clusters?: { id: number; keywords: string[] }[];
        edges?: { source: string; target: string; weight?: number }[];
        total_nodes?: number;
        total_edges?: number;
      };
    }
  ).keyword_graph;

  const perfSources = collectSources(steps, (s) => sourceMatchers.performance(s) || sourceMatchers.strategy(s));
  const kwSources = collectSources(steps, (s) => sourceMatchers.keywordGraph(s));

  if (hydrateLoading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-16 text-center text-sm text-slate-500">Loading performance & keyword data…</div>
    );
  }

  const simExtra =
    sim &&
    Object.fromEntries(
      Object.entries(sim).filter(
        ([k]) =>
          !["channels", "overall_projected_reach", "key_risks", "optimization_suggestions", "reasoning_summary"].includes(k)
      )
    );

  const avgEngagement =
    sim?.channels && sim.channels.length > 0
      ? (sim.channels.reduce((a, c) => a + Number(c.engagement_rate || 0), 0) / sim.channels.length).toFixed(1)
      : null;

  const avgCtr =
    sim?.channels && sim.channels.length > 0
      ? (sim.channels.reduce((a, c) => a + Number(c.click_through_rate || 0), 0) / sim.channels.length).toFixed(2)
      : null;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50/90 to-white pb-16">
      <div className="border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <p className="text-[11px] font-bold uppercase tracking-widest text-teal-600">Simulation</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-slate-900">Performance outlook</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Model-estimated reach, engagement, and CTR by channel — plus risks, optimizations, and the keyword graph.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-10 px-6 pt-10">
        {sim?.channels ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {sim.overall_projected_reach != null && (
                <div className="rounded-2xl border border-teal-200/80 bg-gradient-to-br from-teal-50 to-emerald-50/50 p-5 shadow-md sm:col-span-2 lg:col-span-1">
                  <div className="flex items-center gap-2 text-teal-800">
                    <TrendingUp size={18} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Projected reach</span>
                  </div>
                  <p className="mt-3 text-3xl font-bold tabular-nums text-teal-950">{sim.overall_projected_reach.toLocaleString()}</p>
                </div>
              )}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 text-slate-600">
                  <BarChart3 size={18} className="text-indigo-500" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Channels</span>
                </div>
                <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{sim.channels.length}</p>
              </div>
              {avgEngagement !== null && (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-slate-600">
                    <Users size={18} className="text-violet-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Avg engagement</span>
                  </div>
                  <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{avgEngagement}%</p>
                </div>
              )}
              {avgCtr !== null && (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-slate-600">
                    <MousePointerClick size={18} className="text-amber-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Avg CTR</span>
                  </div>
                  <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{avgCtr}%</p>
                </div>
              )}
            </div>

            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">By channel</h2>
              <p className="text-xs text-slate-500">Impressions and rates are illustrative — use for directional planning.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {sim.channels.map((ch) => (
                  <div
                    key={ch.name}
                    className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-md transition hover:border-indigo-200/80 hover:shadow-lg"
                  >
                    <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-3">
                      <p className="font-display text-sm font-bold text-slate-900">{ch.name}</p>
                      <span className="mt-1 inline-block rounded-full bg-indigo-50 px-2 py-0.5 text-[9px] font-bold uppercase text-indigo-600">
                        {ch.confidence} confidence
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 p-5">
                      <div>
                        <p className="text-[10px] font-bold uppercase text-slate-400">Impressions</p>
                        <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{ch.impressions_estimate?.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase text-slate-400">Engagement</p>
                        <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{ch.engagement_rate}%</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase text-slate-400">CTR</p>
                        <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{ch.click_through_rate}%</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase text-slate-400">Est. leads</p>
                        <p className="mt-1 text-lg font-bold tabular-nums text-teal-700">{ch.estimated_leads}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {sim.reasoning_summary && (
              <div className="overflow-hidden rounded-2xl border border-indigo-100/90 bg-gradient-to-br from-indigo-50/50 via-white to-violet-50/30 p-6 shadow-md">
                <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">Model reasoning</p>
                <p className="mt-3 text-sm leading-relaxed text-slate-800">{sim.reasoning_summary}</p>
              </div>
            )}

            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-4">
              <SourceFootnotes sources={perfSources} />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              {sim.key_risks && sim.key_risks.length > 0 && (
                <div className="overflow-hidden rounded-2xl border border-amber-200/70 bg-gradient-to-br from-amber-50/60 to-white p-6 shadow-md">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500 text-white shadow-md">
                      <AlertTriangle size={18} />
                    </div>
                    <h3 className="font-display text-base font-bold text-slate-900">Key risks</h3>
                  </div>
                  <ul className="mt-5 space-y-3">
                    {sim.key_risks.map((r, i) => (
                      <li key={i} className="flex gap-3 rounded-xl border border-amber-100/80 bg-white/80 px-4 py-3 text-sm text-slate-800 shadow-sm">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-[11px] font-bold text-amber-800">
                          {i + 1}
                        </span>
                        <span className="leading-relaxed">{r}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {sim.optimization_suggestions && sim.optimization_suggestions.length > 0 && (
                <div className="overflow-hidden rounded-2xl border border-indigo-200/70 bg-gradient-to-br from-indigo-50/50 to-white p-6 shadow-md">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-md">
                      <Lightbulb size={18} />
                    </div>
                    <h3 className="font-display text-base font-bold text-slate-900">Optimizations</h3>
                  </div>
                  <ul className="mt-5 space-y-3">
                    {sim.optimization_suggestions.map((s, i) => (
                      <li key={i} className="flex gap-3 rounded-xl border border-indigo-100/80 bg-white/80 px-4 py-3 text-sm text-slate-800 shadow-sm">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-[11px] font-bold text-indigo-800">
                          {i + 1}
                        </span>
                        <span className="leading-relaxed">{s}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {simExtra && Object.keys(simExtra).length > 0 && (
              <details className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <summary className="cursor-pointer px-5 py-4 text-sm font-bold text-slate-800 hover:bg-slate-50">
                  Additional simulation fields
                </summary>
                <div className="border-t border-slate-100 p-5">
                  <StructuredData value={simExtra} />
                </div>
              </details>
            )}
          </>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-14 text-center shadow-md">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
              <TrendingUp className="text-slate-400" size={32} />
            </div>
            <p className="mt-4 text-sm font-medium text-slate-700">No simulation yet</p>
            <p className="mt-1 text-xs text-slate-500">Complete a campaign run to populate projections.</p>
          </div>
        )}

        {kgraph && kgraph.top_keywords && kgraph.top_keywords.length > 0 && (
          <section className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-md">
            <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-6 py-4">
              <h2 className="font-display text-lg font-bold text-slate-900">Keyword graph</h2>
              <p className="mt-1 text-xs text-slate-600">Co-occurrence strength and clusters from the deterministic engine.</p>
            </div>
            <div className="p-6">
              <KeywordGraphPanel
                top_keywords={kgraph.top_keywords}
                clusters={kgraph.clusters}
                edges={kgraph.edges}
                total_nodes={kgraph.total_nodes}
                total_edges={kgraph.total_edges}
              />
              <div className="mt-6 border-t border-slate-100 pt-4">
                <SourceFootnotes sources={kwSources} />
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
