import { useEffect, useState } from "react";
import { useCampaignStore } from "../components/CampaignStore";
import { apiJson } from "../lib/api";
import { Shield, Cpu, ArrowRight, Hash } from "lucide-react";

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
import type { CampaignRecord, LlmTokenUsage } from "../types";

export default function AdminDashboard() {
  const { steps, runId } = useCampaignStore();
  const [allRuns, setAllRuns] = useState<CampaignRecord[]>([]);

  useEffect(() => {
    apiJson<{ runs: CampaignRecord[] }>("/api/admin/runs")
      .then((d) => setAllRuns(d.runs || []))
      .catch(() => {});
  }, []);

  const phases = [...new Set(steps.map((s) => s.phase))];

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Admin — Observability</h1>
        <p className="mt-1 text-sm text-slate-600">Agent workflows, decision traces, and system logs.</p>
      </div>

      {/* Current run agent trace */}
      {steps.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2">
            <Cpu size={18} className="text-indigo-600" />
            <h2 className="font-display text-lg font-semibold text-slate-900">
              Current Run Agent Workflow
              {runId && <span className="ml-2 font-mono text-xs text-slate-400">{runId}</span>}
            </h2>
          </div>

          {/* Phase flow */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {phases.map((p, i) => (
              <span key={p} className="flex items-center gap-1">
                <span className="rounded-lg bg-indigo-100 px-2.5 py-1 text-xs font-semibold text-indigo-700">{p}</span>
                {i < phases.length - 1 && <ArrowRight size={14} className="text-slate-400" />}
              </span>
            ))}
          </div>

          {/* Detailed agent table */}
          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 text-left text-slate-500">
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
                  <tr key={s.id} className="border-b border-slate-50">
                    <td className="py-2 pr-4 font-medium text-slate-800">{s.agent}</td>
                    <td className="py-2 pr-4">
                      <span className="rounded bg-teal-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-teal-700">
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

          {/* Reasoning trace */}
          <details className="mt-4">
            <summary className="cursor-pointer text-xs font-semibold text-indigo-600 hover:underline">
              Full reasoning trace ({steps.length} entries)
            </summary>
            <div className="mt-2 max-h-[400px] overflow-auto rounded-xl bg-slate-50 p-4">
              {steps.map((s) => (
                <div key={s.id} className="mb-3 border-b border-slate-100 pb-3 last:border-0">
                  <p className="font-semibold text-slate-800">
                    [{s.phase}] {s.agent} — {s.title}
                  </p>
                  {s.reasoning && <p className="mt-1 text-xs text-slate-600">{s.reasoning}</p>}
                  {s.summary && <p className="mt-1 text-xs text-slate-500">{s.summary}</p>}
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      {/* All runs */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <Shield size={18} className="text-indigo-600" />
          <h2 className="font-display text-lg font-semibold text-slate-900">All Runs (Firestore)</h2>
        </div>
        <p className="mt-1 text-[11px] text-slate-500">
          LLM token totals include Chat Completions and the Responses API (web search). Breakdown is by workflow phase
          (same stages as the agent trace). Image generation is billed separately and not included here.
        </p>
        {allRuns.length > 0 ? (
          <div className="mt-4 space-y-3">
            {allRuns.map((r) => {
              const u = r.llm_token_usage;
              const tot = u?.total;
              return (
                <div key={r.id} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800">{r.brand_name}</p>
                      <p className="text-[10px] text-slate-400">
                        {r.run_id} · {r.created_at ? new Date(r.created_at).toLocaleString() : ""}
                      </p>
                      {tot != null && (
                        <p className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-600">
                          <span className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 font-medium shadow-sm ring-1 ring-slate-200/80">
                            <Hash size={10} className="text-indigo-500" />
                            {tot.total_tokens.toLocaleString()} tokens
                          </span>
                          <span className="text-slate-400">
                            in {tot.prompt_tokens.toLocaleString()} · out {tot.completion_tokens.toLocaleString()}
                          </span>
                          {u != null && u.call_count > 0 && (
                            <span className="text-slate-400">· {u.call_count} LLM calls</span>
                          )}
                        </p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                        r.status === "completed"
                          ? "bg-teal-100 text-teal-700"
                          : r.status === "running"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-rose-100 text-rose-700"
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
          <p className="mt-4 text-sm text-slate-500">No stored runs. Configure Firebase to enable persistence.</p>
        )}
      </div>
    </div>
  );
}
