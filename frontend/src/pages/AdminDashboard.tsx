import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useCampaignStore } from "../components/CampaignStore";
import { CritiquePanel } from "../components/presentation/CritiquePanel";
import { CreativeDraftDiff } from "../components/presentation/CreativeDraftDiff";
import { SourceFootnotes } from "../components/presentation/SourceFootnotes";
import { apiJson } from "../lib/api";
import { collectSources, sourceMatchers } from "../lib/traceSources";
import type { CampaignRecord, LlmTokenUsage } from "../types";
import {
  ArrowRight,
  BarChart3,
  Cpu,
  GitCompare,
  Hash,
  LineChart,
  Shield,
  Sparkles,
} from "lucide-react";

const CHART_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#14b8a6", "#f59e0b", "#3b82f6", "#10b981"];

function TokenPhaseTable({ usage }: { usage: LlmTokenUsage }) {
  const rows = Object.entries(usage.by_phase || {}).sort((a, b) => b[1].total_tokens - a[1].total_tokens);
  if (rows.length === 0) return null;
  return (
    <div className="mt-2 overflow-x-auto rounded-lg border border-slate-100 bg-white">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b border-slate-100 text-left text-slate-500">
            <th className="px-2 py-1 font-semibold">Phase</th>
            <th className="px-2 py-1 font-semibold">In</th>
            <th className="px-2 py-1 font-semibold">Out</th>
            <th className="px-2 py-1 font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([phase, t]) => (
            <tr key={phase} className="border-b border-slate-50 text-slate-700 last:border-0">
              <td className="px-2 py-1 font-mono text-[9px] capitalize text-indigo-700">{phase.replace(/_/g, " ")}</td>
              <td className="px-2 py-1">{t.prompt_tokens.toLocaleString()}</td>
              <td className="px-2 py-1">{t.completion_tokens.toLocaleString()}</td>
              <td className="px-2 py-1 font-medium">{t.total_tokens.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatPhaseLabel(phase: string) {
  return phase.replace(/_/g, " ");
}

export default function AdminDashboard() {
  const { steps, runId, campaignId, artifacts } = useCampaignStore();
  const [allRuns, setAllRuns] = useState<CampaignRecord[]>([]);
  const [runsError, setRunsError] = useState<string | null>(null);

  useEffect(() => {
    setRunsError(null);
    apiJson<{ runs: CampaignRecord[] }>("/api/admin/runs")
      .then((d) => setAllRuns(d.runs || []))
      .catch((e: Error) => setRunsError(e.message || "Failed to load runs"));
  }, []);

  const phases = [...new Set(steps.map((s) => s.phase))];

  const critique = (artifacts as { creative_critique?: Record<string, unknown> }).creative_critique;
  const critiquePost = (artifacts as { creative_critique_post_refine?: Record<string, unknown> })
    .creative_critique_post_refine;
  const originalCreatives = (artifacts as { original_creatives?: Record<string, unknown> }).original_creatives || {};
  const refinedCreatives = (artifacts as { refined_creatives?: Record<string, unknown> }).refined_creatives || {};
  const deliveredSeo = (artifacts as Record<string, unknown>).seo;
  const deliveredSocial = (artifacts as Record<string, unknown>).social;
  const hadRefinement = Object.keys(refinedCreatives).length > 0;

  const showInitialQa = Boolean(critique && Object.keys(critique).length > 0);
  const showPostQa = Boolean(critiquePost && Object.keys(critiquePost).length > 0);

  const currentRun = useMemo(
    () => allRuns.find((r) => (campaignId && r.id === campaignId) || (runId && r.run_id === runId)) ?? null,
    [allRuns, campaignId, runId],
  );

  const phaseChartData = useMemo(() => {
    const u = currentRun?.llm_token_usage;
    if (!u?.by_phase) return [];
    return Object.entries(u.by_phase)
      .map(([phase, t]) => ({
        phase: formatPhaseLabel(phase),
        total: t.total_tokens,
        in: t.prompt_tokens,
        out: t.completion_tokens,
      }))
      .sort((a, b) => b.total - a.total);
  }, [currentRun]);

  const inOutPie = useMemo(() => {
    const t = currentRun?.llm_token_usage?.total;
    if (!t) return [];
    return [
      { name: "Prompt", value: t.prompt_tokens, fill: "#6366f1" },
      { name: "Completion", value: t.completion_tokens, fill: "#14b8a6" },
    ].filter((x) => x.value > 0);
  }, [currentRun]);

  const runsTotalsChart = useMemo(() => {
    return [...allRuns]
      .filter((r) => r.llm_token_usage?.total?.total_tokens)
      .map((r) => ({
        name: (r.brand_name || r.run_id || "Run").slice(0, 18),
        tokens: r.llm_token_usage!.total.total_tokens,
        id: r.id,
      }))
      .sort((a, b) => b.tokens - a.tokens)
      .slice(0, 12);
  }, [allRuns]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 pb-16">
      <div className="border-b border-white/10 bg-gradient-to-r from-indigo-950/80 to-violet-950/50 px-6 py-10 lg:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center gap-2 text-indigo-300">
            <Shield size={20} />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em]">Restricted</span>
          </div>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-white">Admin console</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-300">
            Critic before/after, creative diffs, LLM token analytics, and agent traces for the selected campaign.
          </p>
          {runId && (
            <p className="mt-3 font-mono text-[11px] text-slate-500">
              Run <span className="text-slate-300">{runId}</span>
              {campaignId && (
                <>
                  {" "}
                  · Campaign <span className="text-slate-300">{campaignId}</span>
                </>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-10 px-6 py-10 lg:px-10">
        {runsError && (
          <div className="rounded-xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
            {runsError}
          </div>
        )}

        {/* Critic QA — before / after */}
        {(showInitialQa || showPostQa) && (
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
            <div className="mb-6 flex items-center gap-2">
              <Sparkles className="text-amber-400" size={22} />
              <div>
                <h2 className="font-display text-lg font-semibold text-white">Creative QA — critic pipeline</h2>
                <p className="text-[12px] text-slate-400">Initial critic vs post-refinement recheck (same rubric).</p>
              </div>
            </div>
            <div className={`grid gap-6 ${showInitialQa && showPostQa ? "xl:grid-cols-2" : "grid-cols-1"}`}>
              {showInitialQa && (
                <div className="rounded-xl border border-slate-600/40 bg-slate-900/50 p-5">
                  <h3 className="font-display text-sm font-bold text-slate-200">Initial draft</h3>
                  <div className="mt-4">
                    <CritiquePanel critique={critique!} />
                  </div>
                  <div className="mt-4 border-t border-slate-700/50 pt-3">
                    <SourceFootnotes sources={collectSources(steps, sourceMatchers.critic)} />
                  </div>
                </div>
              )}
              {showPostQa && (
                <div className="rounded-xl border border-teal-500/30 bg-gradient-to-br from-teal-950/40 to-slate-900/50 p-5">
                  <h3 className="font-display text-sm font-bold text-teal-100">After refinement</h3>
                  <div className="mt-4">
                    <CritiquePanel critique={critiquePost!} />
                  </div>
                  <div className="mt-4 border-t border-teal-900/40 pt-3">
                    <SourceFootnotes sources={collectSources(steps, sourceMatchers.criticRecheck)} />
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Draft diff */}
        {hadRefinement && (
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-xl backdrop-blur-sm">
            <div className="mb-4 flex items-center gap-2 text-white">
              <GitCompare className="text-violet-400" size={22} />
              <div>
                <h2 className="font-display text-lg font-semibold">Creative bundle — before vs after</h2>
                <p className="text-[12px] text-slate-400">Highlights and channel JSON deltas from refinement.</p>
              </div>
            </div>
            <div className="rounded-xl border border-slate-700/50 bg-slate-950/40 p-4">
              <CreativeDraftDiff
                originalCreatives={originalCreatives}
                refinedCreatives={refinedCreatives}
                deliveredSeo={deliveredSeo}
                deliveredSocial={deliveredSocial}
              />
            </div>
          </section>
        )}

        {/* Token analytics */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-xl backdrop-blur-sm">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div className="flex items-center gap-2">
              <LineChart className="text-cyan-400" size={22} />
              <div>
                <h2 className="font-display text-lg font-semibold text-white">LLM token usage</h2>
                <p className="text-[12px] text-slate-400">
                  Chat Completions + Responses API by workflow phase. Image generation excluded.
                </p>
              </div>
            </div>
            {currentRun?.llm_token_usage?.total && (
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-300">
                <span className="inline-flex items-center gap-1 rounded-lg bg-indigo-500/20 px-2.5 py-1 font-mono font-semibold text-indigo-200 ring-1 ring-indigo-500/30">
                  <Hash size={12} />
                  {currentRun.llm_token_usage.total.total_tokens.toLocaleString()} total
                </span>
                <span className="text-slate-500">
                  {currentRun.llm_token_usage.call_count} LLM calls · in{" "}
                  {currentRun.llm_token_usage.total.prompt_tokens.toLocaleString()} · out{" "}
                  {currentRun.llm_token_usage.total.completion_tokens.toLocaleString()}
                </span>
              </div>
            )}
          </div>

          {currentRun?.llm_token_usage && phaseChartData.length > 0 ? (
            <div className="grid gap-8 lg:grid-cols-5">
              <div className="lg:col-span-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Current campaign — by phase</p>
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={phaseChartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                      <XAxis dataKey="phase" tick={{ fill: "#94a3b8", fontSize: 10 }} interval={0} angle={-12} textAnchor="end" height={70} />
                      <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "8px", fontSize: "11px" }}
                        labelStyle={{ color: "#e2e8f0" }}
                      />
                      <Legend />
                      <Bar dataKey="in" name="Prompt" stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="out" name="Completion" stackId="a" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="lg:col-span-2">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">In vs out</p>
                <div className="flex h-72 items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={inOutPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={80} paddingAngle={2}>
                        {inOutPie.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "8px", fontSize: "11px" }}
                        formatter={(v: number) => v.toLocaleString()}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Select a completed campaign with token data, or run a new campaign to populate usage.</p>
          )}

          {currentRun?.llm_token_usage && <TokenPhaseTable usage={currentRun.llm_token_usage} />}
        </section>

        {/* Runs comparison */}
        {runsTotalsChart.length > 0 && (
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-xl backdrop-blur-sm">
            <div className="mb-4 flex items-center gap-2">
              <BarChart3 className="text-fuchsia-400" size={22} />
              <div>
                <h2 className="font-display text-lg font-semibold text-white">Recent runs — total tokens</h2>
                <p className="text-[12px] text-slate-400">Top stored campaigns from Firestore (admin list).</p>
              </div>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={runsTotalsChart} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} />
                  <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10 }} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ fill: "#cbd5e1", fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "8px", fontSize: "11px" }}
                    formatter={(v: number) => [v.toLocaleString(), "tokens"]}
                  />
                  <Bar dataKey="tokens" radius={[0, 4, 4, 0]}>
                    {runsTotalsChart.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {/* Agent trace */}
        {steps.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-xl backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <Cpu size={20} className="text-indigo-400" />
              <h2 className="font-display text-lg font-semibold text-white">Current run — agent workflow</h2>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              {phases.map((p, i) => (
                <span key={p} className="flex items-center gap-1">
                  <span className="rounded-lg bg-indigo-500/20 px-2.5 py-1 text-xs font-semibold text-indigo-200 ring-1 ring-indigo-500/30">
                    {p}
                  </span>
                  {i < phases.length - 1 && <ArrowRight size={14} className="text-slate-600" />}
                </span>
              ))}
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full text-xs text-slate-300">
                <thead>
                  <tr className="border-b border-slate-700 text-left text-slate-500">
                    <th className="pb-2 pr-4 font-semibold">Agent</th>
                    <th className="pb-2 pr-4 font-semibold">Phase</th>
                    <th className="pb-2 pr-4 font-semibold">Title</th>
                    <th className="pb-2 pr-4 font-semibold">Tools</th>
                    <th className="pb-2 pr-4 font-semibold">Queries</th>
                    <th className="pb-2 font-semibold">Sources</th>
                  </tr>
                </thead>
                <tbody>
                  {steps.map((s) => (
                    <tr key={s.id} className="border-b border-slate-800/80">
                      <td className="py-2 pr-4 font-medium text-slate-200">{s.agent}</td>
                      <td className="py-2 pr-4">
                        <span className="rounded bg-teal-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-teal-300 ring-1 ring-teal-500/25">
                          {s.phase}
                        </span>
                      </td>
                      <td className="max-w-[200px] truncate py-2 pr-4 text-slate-400">{s.title}</td>
                      <td className="py-2 pr-4 text-slate-500">{s.tool_calls?.map((t) => t.name).join(", ") || "—"}</td>
                      <td className="py-2 pr-4 text-slate-500">{s.web_queries?.length || 0}</td>
                      <td className="py-2 text-slate-500">{s.sources?.length || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-semibold text-indigo-300 hover:text-indigo-200">
                Full reasoning trace ({steps.length} entries)
              </summary>
              <div className="mt-2 max-h-[400px] overflow-auto rounded-xl bg-slate-950/60 p-4 ring-1 ring-slate-800">
                {steps.map((s) => (
                  <div key={s.id} className="mb-3 border-b border-slate-800/80 pb-3 last:border-0">
                    <p className="font-semibold text-slate-200">
                      [{s.phase}] {s.agent} — {s.title}
                    </p>
                    {s.reasoning && <p className="mt-1 text-xs text-slate-400">{s.reasoning}</p>}
                    {s.summary && <p className="mt-1 text-xs text-slate-500">{s.summary}</p>}
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}

        {/* All runs list */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-xl backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <Shield size={20} className="text-indigo-400" />
            <h2 className="font-display text-lg font-semibold text-white">All runs (Firestore)</h2>
          </div>
          {allRuns.length > 0 ? (
            <div className="mt-4 space-y-3">
              {allRuns.map((r) => {
                const u = r.llm_token_usage;
                const tot = u?.total;
                return (
                  <div key={r.id} className="rounded-xl border border-slate-700/50 bg-slate-950/40 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-100">{r.brand_name}</p>
                        <p className="text-[10px] text-slate-500">
                          {r.run_id} · {r.created_at ? new Date(r.created_at).toLocaleString() : ""}
                        </p>
                        {tot != null && (
                          <p className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                            <span className="inline-flex items-center gap-1 rounded-md bg-indigo-500/15 px-1.5 py-0.5 font-medium text-indigo-200 ring-1 ring-indigo-500/25">
                              <Hash size={10} />
                              {tot.total_tokens.toLocaleString()} tokens
                            </span>
                            <span>
                              in {tot.prompt_tokens.toLocaleString()} · out {tot.completion_tokens.toLocaleString()}
                            </span>
                            {u != null && u.call_count > 0 && <span>· {u.call_count} LLM calls</span>}
                          </p>
                        )}
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                          r.status === "completed"
                            ? "bg-teal-500/20 text-teal-300 ring-1 ring-teal-500/30"
                            : r.status === "running"
                              ? "bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/30"
                              : "bg-rose-500/20 text-rose-200 ring-1 ring-rose-500/30"
                        }`}
                      >
                        {r.status}
                      </span>
                    </div>
                    {u != null && <TokenPhaseTable usage={u} />}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">No stored runs, or Firebase is not configured.</p>
          )}
        </div>
      </div>
    </div>
  );
}
