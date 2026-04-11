import { useCampaignStore } from "../components/CampaignStore";
import { KeywordGraphPanel } from "../components/presentation/KeywordGraphPanel";
import { SourceFootnotes } from "../components/presentation/SourceFootnotes";
import { StructuredData } from "../components/presentation/StructuredData";
import { collectSources, sourceMatchers } from "../lib/traceSources";
import { TrendingUp, AlertTriangle, Lightbulb } from "lucide-react";

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

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Performance Simulation</h1>
        <p className="mt-1 text-sm text-slate-600">Projected reach, risks, and keyword graph — with agent sources.</p>
      </div>

      {sim?.channels ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {sim.channels.map((ch) => (
              <div key={ch.name} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="font-semibold text-slate-900">{ch.name}</p>
                <div className="mt-3 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Impressions</span>
                    <span className="font-semibold text-slate-800">{ch.impressions_estimate?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Engagement</span>
                    <span className="font-semibold text-slate-800">{ch.engagement_rate}%</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">CTR</span>
                    <span className="font-semibold text-slate-800">{ch.click_through_rate}%</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-500">Est. leads</span>
                    <span className="font-semibold text-teal-700">{ch.estimated_leads}</span>
                  </div>
                </div>
                <span className="mt-3 inline-block rounded-full bg-indigo-50 px-2 py-0.5 text-[9px] font-bold text-indigo-600">
                  {ch.confidence} confidence
                </span>
              </div>
            ))}
          </div>

          {sim.overall_projected_reach != null && (
            <div className="flex items-center gap-3 rounded-2xl border border-teal-200 bg-teal-50 p-5">
              <TrendingUp className="text-teal-600" size={24} />
              <div>
                <p className="font-semibold text-teal-900">Projected total reach</p>
                <p className="text-2xl font-bold tabular-nums text-teal-800">{sim.overall_projected_reach.toLocaleString()}</p>
              </div>
            </div>
          )}

          {sim.reasoning_summary && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="text-[10px] font-bold uppercase text-slate-400">Model reasoning</p>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">{sim.reasoning_summary}</p>
            </div>
          )}

          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-4">
            <SourceFootnotes sources={perfSources} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {sim.key_risks && sim.key_risks.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-500" />
                  <h3 className="font-display font-semibold text-slate-900">Key risks</h3>
                </div>
                <ul className="mt-3 space-y-2">
                  {sim.key_risks.map((r, i) => (
                    <li key={i} className="text-sm text-slate-600">
                      · {r}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {sim.optimization_suggestions && sim.optimization_suggestions.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2">
                  <Lightbulb size={16} className="text-indigo-500" />
                  <h3 className="font-display font-semibold text-slate-900">Optimizations</h3>
                </div>
                <ul className="mt-3 space-y-2">
                  {sim.optimization_suggestions.map((s, i) => (
                    <li key={i} className="text-sm text-slate-600">
                      → {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {simExtra && Object.keys(simExtra).length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="font-display text-sm font-semibold text-slate-900">Additional simulation fields</h3>
              <div className="mt-3">
                <StructuredData value={simExtra} />
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <TrendingUp className="mx-auto text-slate-300" size={40} />
          <p className="mt-3 text-sm text-slate-500">Performance projections appear after the simulation agent runs.</p>
        </div>
      )}

      {kgraph && kgraph.top_keywords && kgraph.top_keywords.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-slate-900">Keyword graph</h2>
          <p className="mt-1 text-sm text-slate-600">Co-occurrence strength and theme clusters (deterministic engine).</p>
          <div className="mt-4">
            <KeywordGraphPanel
              top_keywords={kgraph.top_keywords}
              clusters={kgraph.clusters}
              edges={kgraph.edges}
              total_nodes={kgraph.total_nodes}
              total_edges={kgraph.total_edges}
            />
          </div>
          <SourceFootnotes sources={kwSources} />
        </div>
      )}
    </div>
  );
}
