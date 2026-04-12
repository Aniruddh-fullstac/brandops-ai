import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart as RechartsLineChart,
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
  Layers,
  PieChart as PieChartIcon,
  Shield,
  Sparkles,
  TrendingUp,
  Workflow,
} from "lucide-react";

const CHART_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#14b8a6", "#f59e0b", "#3b82f6", "#10b981", "#f43f5e"];

const tooltipLight = {
  contentStyle: {
    background: "#ffffff",
    border: "1px solid #e2e8f8",
    borderRadius: "10px",
    fontSize: "12px",
    boxShadow: "0 10px 40px -10px rgb(15 23 42 / 0.15)",
  },
  labelStyle: { color: "#0f172a", fontWeight: 600 },
};

function TokenPhaseTable({ usage }: { usage: LlmTokenUsage }) {
  const rows = Object.entries(usage.by_phase || {}).sort((a, b) => b[1].total_tokens - a[1].total_tokens);
  if (rows.length === 0) return null;
  return (
    <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50/80">
      <table className="w-full text-[10px]">
        <thead>
          <tr className="border-b border-slate-200 text-left text-slate-500">
            <th className="px-2 py-1.5 font-semibold">Phase</th>
            <th className="px-2 py-1.5 font-semibold">In</th>
            <th className="px-2 py-1.5 font-semibold">Out</th>
            <th className="px-2 py-1.5 font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([phase, t]) => (
            <tr key={phase} className="border-b border-slate-100 text-slate-700 last:border-0">
              <td className="px-2 py-1.5 font-mono text-[9px] capitalize text-indigo-700">{phase.replace(/_/g, " ")}</td>
              <td className="px-2 py-1.5">{t.prompt_tokens.toLocaleString()}</td>
              <td className="px-2 py-1.5">{t.completion_tokens.toLocaleString()}</td>
              <td className="px-2 py-1.5 font-medium">{t.total_tokens.toLocaleString()}</td>
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

function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent: "indigo" | "teal" | "violet" | "amber";
}) {
  const ring =
    accent === "indigo"
      ? "from-indigo-500/15 to-violet-500/10 ring-indigo-200"
      : accent === "teal"
        ? "from-teal-500/15 to-cyan-500/10 ring-teal-200"
        : accent === "violet"
          ? "from-violet-500/15 to-fuchsia-500/10 ring-violet-200"
          : "from-amber-500/15 to-orange-500/10 ring-amber-200";
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${ring} p-4 shadow-sm ring-1`}>
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  icon: Icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white p-6 shadow-sm shadow-slate-200/40">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100">
          <Icon size={20} />
        </div>
        <div>
          <h2 className="font-display text-lg font-semibold text-slate-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[13px] text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
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

  const aggregateStats = useMemo(() => {
    const withUsage = allRuns.filter((r) => r.llm_token_usage?.total);
    const sumTokens = withUsage.reduce((acc, r) => acc + (r.llm_token_usage!.total.total_tokens || 0), 0);
    const sumCalls = withUsage.reduce((acc, r) => acc + (r.llm_token_usage?.call_count || 0), 0);
    const avg = withUsage.length ? Math.round(sumTokens / withUsage.length) : 0;
    return {
      runCount: allRuns.length,
      withTokenData: withUsage.length,
      sumTokens,
      sumCalls,
      avg,
    };
  }, [allRuns]);

  const runsTimeline = useMemo(() => {
    return [...allRuns]
      .filter((r) => r.created_at && r.llm_token_usage?.total?.total_tokens)
      .sort((a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime())
      .map((r, i) => ({
        idx: i + 1,
        label:
          new Date(r.created_at!).toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
          " " +
          (r.brand_name || "").slice(0, 8),
        tokens: r.llm_token_usage!.total.total_tokens,
      }));
  }, [allRuns]);

  const phaseStepCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const s of steps) {
      m[s.phase] = (m[s.phase] || 0) + 1;
    }
    return Object.entries(m)
      .map(([phase, count]) => ({ phase: formatPhaseLabel(phase), count }))
      .sort((a, b) => b.count - a.count);
  }, [steps]);

  const phaseStepPie = useMemo(
    () =>
      phaseStepCounts.map((p, i) => ({
        name: p.phase,
        value: p.count,
        fill: CHART_COLORS[i % CHART_COLORS.length],
      })),
    [phaseStepCounts],
  );

  const phaseLineData = useMemo(() => {
    let acc = 0;
    return phaseChartData
      .slice()
      .reverse()
      .map((row) => {
        acc += row.total;
        return { phase: row.phase, cumulative: acc, step: row.total };
      });
  }, [phaseChartData]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-100/90 via-[#f4f6fb] to-white pb-16">
      <div className="border-b border-slate-200/80 bg-white px-6 py-10 shadow-sm lg:px-10">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-center gap-2 text-indigo-600">
            <Shield size={20} />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em]">Admin</span>
          </div>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-slate-900">Observability console</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            Token analytics, workflow visuals, critic QA, and traces for the selected campaign.
          </p>
          {runId && (
            <p className="mt-3 font-mono text-[11px] text-slate-500">
              Run <span className="text-slate-800">{runId}</span>
              {campaignId && (
                <>
                  {" "}
                  · Campaign <span className="text-slate-800">{campaignId}</span>
                </>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-8 px-6 py-8 lg:px-10">
        {runsError && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{runsError}</div>
        )}

        {/* KPI strip */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Stored runs" value={String(aggregateStats.runCount)} hint="In Firestore" accent="indigo" />
          <StatCard
            label="Total LLM tokens (all runs)"
            value={aggregateStats.sumTokens.toLocaleString()}
            hint={`${aggregateStats.withTokenData} runs with usage`}
            accent="teal"
          />
          <StatCard label="Avg tokens / run" value={aggregateStats.avg.toLocaleString()} hint="Where usage exists" accent="violet" />
          <StatCard label="LLM calls (all runs)" value={String(aggregateStats.sumCalls)} hint="Chat + Responses API" accent="amber" />
        </div>

        {/* Charts row 1 — overview */}
        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard
            title="Token spend over recent runs"
            subtitle="Chronological — each point is one completed run with usage data"
            icon={TrendingUp}
          >
            {runsTimeline.length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={runsTimeline} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="fillTokens" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 9 }} interval={0} angle={-20} textAnchor="end" height={56} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 10 }} />
                    <Tooltip {...tooltipLight} formatter={(v: number) => [v.toLocaleString(), "tokens"]} />
                    <Area type="monotone" dataKey="tokens" stroke="#4f46e5" strokeWidth={2} fill="url(#fillTokens)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No timestamped runs with token data yet.</p>
            )}
          </SectionCard>

          <SectionCard
            title="Runs ranked by total tokens"
            subtitle="Compare heaviest campaigns at a glance"
            icon={BarChart3}
          >
            {runsTotalsChart.length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={runsTotalsChart} layout="vertical" margin={{ left: 4, right: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                    <XAxis type="number" tick={{ fill: "#64748b", fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" width={96} tick={{ fill: "#334155", fontSize: 10 }} />
                    <Tooltip {...tooltipLight} formatter={(v: number) => [v.toLocaleString(), "tokens"]} />
                    <Bar dataKey="tokens" radius={[0, 6, 6, 0]}>
                      {runsTotalsChart.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-sm text-slate-500">No runs with token totals.</p>
            )}
          </SectionCard>
        </div>

        {/* Current campaign — tokens */}
        <SectionCard
          title="Current campaign — LLM usage"
          subtitle="Stacked prompt vs completion by workflow phase; cumulative curve"
          icon={Hash}
        >
          {currentRun?.llm_token_usage?.total && (
            <div className="mb-4 flex flex-wrap gap-3 text-[12px] text-slate-600">
              <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 font-semibold text-indigo-800 ring-1 ring-indigo-100">
                {currentRun.llm_token_usage.total.total_tokens.toLocaleString()} total tokens
              </span>
              <span>
                {currentRun.llm_token_usage.call_count} calls · in {currentRun.llm_token_usage.total.prompt_tokens.toLocaleString()} · out{" "}
                {currentRun.llm_token_usage.total.completion_tokens.toLocaleString()}
              </span>
            </div>
          )}

          {currentRun?.llm_token_usage && phaseChartData.length > 0 ? (
            <div className="grid gap-8 lg:grid-cols-2">
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">By phase (stacked)</p>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={phaseChartData} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="phase" tick={{ fill: "#64748b", fontSize: 9 }} interval={0} angle={-14} textAnchor="end" height={64} />
                      <YAxis tick={{ fill: "#64748b", fontSize: 10 }} />
                      <Tooltip {...tooltipLight} />
                      <Legend />
                      <Bar dataKey="in" name="Prompt" stackId="a" fill="#818cf8" radius={[0, 0, 0, 0]} />
                      <Bar dataKey="out" name="Completion" stackId="a" fill="#2dd4bf" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Cumulative tokens by phase</p>
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsLineChart data={phaseLineData} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="phase" tick={{ fill: "#64748b", fontSize: 9 }} interval={0} angle={-14} textAnchor="end" height={64} />
                      <YAxis tick={{ fill: "#64748b", fontSize: 10 }} />
                      <Tooltip {...tooltipLight} />
                      <Legend />
                      <Line type="monotone" dataKey="cumulative" name="Cumulative" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }} />
                      <Line type="monotone" dataKey="step" name="Phase total" stroke="#0ea5e9" strokeWidth={1.5} dot={{ r: 2 }} />
                    </RechartsLineChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Prompt vs completion</p>
                <div className="flex h-64 items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={inOutPie} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={56} outerRadius={88} paddingAngle={2}>
                        {inOutPie.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip {...tooltipLight} formatter={(v: number) => v.toLocaleString()} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Phase table</p>
                <TokenPhaseTable usage={currentRun.llm_token_usage} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Select a completed campaign with token data in the campaign switcher, or run a new job.</p>
          )}
        </SectionCard>

        {/* Agent workflow visuals */}
        {steps.length > 0 && (
          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title="Trace steps per phase" subtitle="How many agent steps executed in each graph phase" icon={Layers}>
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={phaseStepCounts} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="phase" tick={{ fill: "#64748b", fontSize: 9 }} interval={0} angle={-16} textAnchor="end" height={68} />
                    <YAxis allowDecimals={false} tick={{ fill: "#64748b", fontSize: 10 }} />
                    <Tooltip {...tooltipLight} />
                    <Bar dataKey="count" name="Steps" fill="#6366f1" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </SectionCard>
            <SectionCard title="Phase mix (current run)" subtitle="Share of trace rows by phase" icon={PieChartIcon}>
              {phaseStepPie.length > 0 ? (
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={phaseStepPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={78} label={({ name, percent }) =>
                        `${name} ${(percent * 100).toFixed(0)}%`
                      }
                      >
                        {phaseStepPie.map((e, i) => (
                          <Cell key={e.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip {...tooltipLight} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="text-sm text-slate-500">No steps.</p>
              )}
            </SectionCard>
          </div>
        )}

        {/* Critic QA */}
        {(showInitialQa || showPostQa) && (
          <SectionCard
            title="Creative QA — critic pipeline"
            subtitle="Initial critic vs post-refinement recheck"
            icon={Sparkles}
          >
            <div className={`grid gap-6 ${showInitialQa && showPostQa ? "xl:grid-cols-2" : "grid-cols-1"}`}>
              {showInitialQa && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-5">
                  <h3 className="font-display text-sm font-bold text-slate-800">Initial draft</h3>
                  <div className="mt-4">
                    <CritiquePanel critique={critique!} />
                  </div>
                  <div className="mt-4 border-t border-slate-200 pt-3">
                    <SourceFootnotes sources={collectSources(steps, sourceMatchers.critic)} />
                  </div>
                </div>
              )}
              {showPostQa && (
                <div className="rounded-xl border border-teal-200 bg-gradient-to-br from-teal-50/80 to-white p-5">
                  <h3 className="font-display text-sm font-bold text-teal-900">After refinement</h3>
                  <div className="mt-4">
                    <CritiquePanel critique={critiquePost!} />
                  </div>
                  <div className="mt-4 border-t border-teal-100 pt-3">
                    <SourceFootnotes sources={collectSources(steps, sourceMatchers.criticRecheck)} />
                  </div>
                </div>
              )}
            </div>
          </SectionCard>
        )}

        {hadRefinement && (
          <SectionCard
            title="Creative bundle — before vs after"
            subtitle="Highlights and channel-level deltas"
            icon={GitCompare}
          >
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <CreativeDraftDiff
                originalCreatives={originalCreatives}
                refinedCreatives={refinedCreatives}
                deliveredSeo={deliveredSeo}
                deliveredSocial={deliveredSocial}
              />
            </div>
          </SectionCard>
        )}

        {steps.length > 0 && (
          <SectionCard title="Agent workflow trace" subtitle="Ordered phases and per-step detail" icon={Workflow}>
            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-3 ring-1 ring-slate-100">
              {phases.map((p, i) => (
                <span key={p} className="flex items-center gap-1">
                  <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-indigo-700 shadow-sm ring-1 ring-indigo-100">
                    {p}
                  </span>
                  {i < phases.length - 1 && <ArrowRight size={14} className="text-slate-400" />}
                </span>
              ))}
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs text-slate-700">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
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
                    <tr key={s.id} className="border-b border-slate-100">
                      <td className="py-2 pr-4 font-medium text-slate-900">{s.agent}</td>
                      <td className="py-2 pr-4">
                        <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[9px] font-bold uppercase text-teal-800 ring-1 ring-teal-100">
                          {s.phase}
                        </span>
                      </td>
                      <td className="max-w-[200px] truncate py-2 pr-4 text-slate-600">{s.title}</td>
                      <td className="py-2 pr-4 text-slate-500">{s.tool_calls?.map((t) => t.name).join(", ") || "—"}</td>
                      <td className="py-2 pr-4 text-slate-500">{s.web_queries?.length || 0}</td>
                      <td className="py-2 text-slate-500">{s.sources?.length || 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <details className="mt-4">
              <summary className="cursor-pointer text-xs font-semibold text-indigo-600 hover:text-indigo-800">
                Full reasoning trace ({steps.length} entries)
              </summary>
              <div className="mt-2 max-h-[400px] overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-4">
                {steps.map((s) => (
                  <div key={s.id} className="mb-3 border-b border-slate-200 pb-3 last:border-0">
                    <p className="font-semibold text-slate-900">
                      [{s.phase}] {s.agent} — {s.title}
                    </p>
                    {s.reasoning && <p className="mt-1 text-xs text-slate-600">{s.reasoning}</p>}
                    {s.summary && <p className="mt-1 text-xs text-slate-500">{s.summary}</p>}
                  </div>
                ))}
              </div>
            </details>
          </SectionCard>
        )}

        <SectionCard title="All runs (Firestore)" subtitle="Persisted campaigns with per-run token breakdown" icon={Cpu}>
          {allRuns.length > 0 ? (
            <div className="space-y-3">
              {allRuns.map((r) => {
                const u = r.llm_token_usage;
                const tot = u?.total;
                return (
                  <div key={r.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">{r.brand_name}</p>
                        <p className="text-[10px] text-slate-500">
                          {r.run_id} · {r.created_at ? new Date(r.created_at).toLocaleString() : ""}
                        </p>
                        {tot != null && (
                          <p className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-600">
                            <span className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 font-medium text-indigo-700 shadow-sm ring-1 ring-slate-200">
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
                            ? "bg-teal-100 text-teal-800"
                            : r.status === "running"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-rose-100 text-rose-800"
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
            <p className="text-sm text-slate-500">No stored runs, or Firebase is not configured.</p>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
