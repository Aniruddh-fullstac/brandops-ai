import { useCallback, useState } from "react";
import { WorkflowViz } from "../components/WorkflowViz";
import { MindWebLoader, MindWebMini } from "../components/mindweb";
import { getNodeIdForPhase } from "../components/mindweb/graphHelpers";
import { rememberLastCampaignId, useCampaignStore } from "../components/CampaignStore";
import { StructuredData } from "../components/presentation/StructuredData";
import { apiFetch } from "../lib/api";
import type { StreamEvent, TraceStep } from "../types";
import { GRAPH_PIPELINE } from "../workflowConfig";
import {
  ChevronDown,
  ChevronRight,
  Cpu,
  ExternalLink,
  Play,
  Sparkles,
} from "lucide-react";

/* ── Tiny spinner ── */
function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" className="animate-spin text-current">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/* ── Source list ── */
function SourceList({ steps }: { steps: TraceStep[] }) {
  const seen = new Map<string, { url: string; title?: string | null }>();
  for (const s of steps)
    for (const x of s.sources || [])
      if (x.url && !seen.has(x.url)) seen.set(x.url, x);
  const sources = [...seen.values()];
  if (!sources.length) return <p className="py-4 text-center text-xs text-slate-400">Sources appear as agents run.</p>;
  return (
    <ul className="space-y-1">
      {sources.map((s, i) => (
        <li
          key={s.url}
          className="anim-fade-up flex items-start gap-2 rounded-lg px-2 py-1.5 transition hover:bg-slate-50"
          style={{ animationDelay: `${i * 0.03}s` }}
        >
          <ExternalLink size={10} className="mt-1 flex-shrink-0 text-indigo-400" />
          <div className="min-w-0">
            <a href={s.url} target="_blank" rel="noreferrer" className="text-[11px] font-medium text-indigo-600 hover:underline leading-tight line-clamp-1">
              {s.title || (() => { try { return new URL(s.url).hostname; } catch { return s.url; } })()}
            </a>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ── Agent card ── */
function AgentCard({ step, index }: { step: TraceStep; index: number }) {
  const [open, setOpen] = useState(false);
  const nodeId = getNodeIdForPhase(step.phase) || step.phase;
  const node = GRAPH_PIPELINE.find((n) => n.id === nodeId);
  const Icon = node?.icon || Cpu;

  // Color map for phase badges
  const phaseColor: Record<string, string> = {
    ingest: "bg-blue-50 text-blue-700 border-blue-200",
    brand_fetch: "bg-cyan-50 text-cyan-700 border-cyan-200",
    parallel_research: "bg-amber-50 text-amber-700 border-amber-200",
    strategy: "bg-violet-50 text-violet-700 border-violet-200",
    creatives: "bg-pink-50 text-pink-700 border-pink-200",
    critic: "bg-orange-50 text-orange-700 border-orange-200",
    refine: "bg-rose-50 text-rose-700 border-rose-200",
    post_critic_parallel: "bg-emerald-50 text-emerald-700 border-emerald-200",
    parallel_schedule_bundle: "bg-teal-50 text-teal-700 border-teal-200",
    finalize: "bg-indigo-50 text-indigo-700 border-indigo-200",
  };
  const badgeClass = phaseColor[nodeId] || phaseColor[step.phase] || "bg-slate-50 text-slate-600 border-slate-200";

  return (
    <article
      className="anim-fade-up rounded-xl border border-slate-200/60 bg-white p-4 transition-all hover:shadow-md hover:border-slate-300/60"
      style={{ animationDelay: `${index * 0.04}s` }}
    >
      {/* Top row: phase badge + agent name */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md border ${badgeClass}`}>
            <Icon size={12} />
          </div>
          <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${badgeClass}`}>
            {node?.label || step.phase.replace(/_/g, " ")}
          </span>
        </div>
        <span className="truncate text-[9px] font-mono text-slate-400">{step.agent}</span>
      </div>

      {/* Title + summary */}
      <h3 className="mt-2.5 text-[13px] font-semibold leading-snug text-slate-900">{step.title}</h3>
      {step.summary && (
        <p className="mt-1 text-[11px] leading-relaxed text-slate-500 line-clamp-2">{step.summary}</p>
      )}

      {/* Expandable details */}
      {(step.reasoning || step.tool_calls?.length || step.web_queries?.length) && (
        <>
          <button
            onClick={() => setOpen(!open)}
            className="mt-2 flex items-center gap-0.5 text-[10px] font-semibold text-indigo-500 hover:text-indigo-700 transition-colors"
          >
            {open ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            {open ? "Less" : "Details"}
          </button>
          {open && (
            <div className="anim-fade-up mt-2 space-y-1 border-t border-slate-100 pt-2 text-[10px] text-slate-400">
              {step.reasoning && <p className="text-slate-500">{step.reasoning}</p>}
              {!!step.tool_calls?.length && (
                <p><span className="font-semibold text-slate-500">Tools:</span> {step.tool_calls.map((t) => t.name).join(", ")}</p>
              )}
              {!!step.web_queries?.length && (
                <p><span className="font-semibold text-slate-500">Queries:</span> {step.web_queries.slice(0, 3).join(" · ")}</p>
              )}
            </div>
          )}
        </>
      )}
    </article>
  );
}

/* ── Section card ── */
function Section({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`anim-scale-in overflow-hidden rounded-2xl border border-slate-200/60 bg-white ${className}`}>
      <div className="px-4 py-3 border-b border-slate-100">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/* ── Empty state ── */
function EmptyState() {
  return (
    <div className="anim-fade-in flex flex-col items-center justify-center py-20 text-center">
      <div className="anim-float relative mb-5">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-xl shadow-indigo-200/50">
          <Sparkles size={32} className="text-white" />
        </div>
        <div className="absolute -right-1 -top-1 h-4 w-4 rounded-full bg-teal-400 border-2 border-white" />
      </div>
      <h3 className="text-lg font-bold text-slate-800">Ready to launch</h3>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-400">
        Enter your brand details above and run the campaign graph. Our AI agents will research, strategize, and create your campaign.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
        {GRAPH_PIPELINE.map((node, i) => {
          const Icon = node.icon;
          return (
            <div
              key={node.id}
              className="anim-fade-up flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm"
              style={{ animationDelay: `${i * 0.06}s` }}
            >
              <Icon size={12} className="text-slate-400" />
              <span className="text-[10px] font-medium text-slate-500">{node.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Main page ── */
export default function NewCampaign() {
  const store = useCampaignStore();
  const { busy, steps, activities, graphNodesDone, runId, partial, result, errors, banner, artifacts } = store;
  const hasResults = steps.length > 0 || busy;

  // Mind Web animation state
  const [showMindWeb, setShowMindWeb] = useState(false);
  const doneCnt = GRAPH_PIPELINE.filter((n) => graphNodesDone.has(n.id)).length;

  const run = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const brandName = (fd.get("brand_name") as string)?.trim();
      if (!brandName) { store.setBanner("Brand name is required."); return; }
      store.reset();
      store.setBusy(true);
      setShowMindWeb(true);
      try {
        const body = {
          brand_name: brandName,
          brand_url: (fd.get("brand_url") as string)?.trim() || null,
          instagram_handle: (fd.get("instagram_handle") as string)?.trim().replace(/^@/, "") || null,
          additional_context: (fd.get("additional_context") as string)?.trim() || null,
          geography_primary: (fd.get("geo1") as string)?.trim() || "United States",
          geography_secondary: (fd.get("geo2") as string)?.trim() || "India",
          industry_hint: (fd.get("industry") as string)?.trim() || null,
          generate_images: fd.get("images") === "on",
        };
        const res = await apiFetch("/api/campaigns/stream", { method: "POST", body: JSON.stringify(body) });
        if (!res.ok || !res.body) throw new Error(`Stream failed (${res.status})`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const parts = buf.split("\n\n");
          buf = parts.pop() || "";
          for (const block of parts) {
            const line = block.trim();
            if (!line.startsWith("data:")) continue;
            const evt = JSON.parse(line.slice(5).trim()) as StreamEvent;
            if (evt.event === "run_started") store.setRunId(evt.payload.run_id);
            if (evt.event === "graph_node_finished") {
              store.addGraphNode(evt.payload.node);
              if (evt.payload.node === "post_critic_parallel") store.addGraphNode("refine");
            }
            if (evt.event === "step_completed") store.addStep(evt.payload.step);
            if (evt.event === "agent_activity") store.addActivity(evt.payload);
            if (evt.event === "artifact_partial") store.setPartial(evt.payload.kind, evt.payload.data);
            if (evt.event === "run_completed") {
              store.setResult(evt.payload.result);
              store.setErrors(evt.payload.errors || []);
              if (evt.payload.campaign_id) {
                store.setCampaignId(evt.payload.campaign_id);
                rememberLastCampaignId(evt.payload.campaign_id);
              }
            }
            if (evt.event === "run_failed") store.setBanner(evt.payload.error);
          }
        }
      } catch (err) {
        store.setBanner(err instanceof Error ? err.message : "Unknown error");
      } finally {
        store.setBusy(false);
      }
    },
    [store]
  );

  const inp = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-shadow";
  const imageUrls = ((artifacts as { image_urls?: string[] }).image_urls || []).filter(Boolean);

  return (
    <>
      {/* ━━ Mind Web animation overlay ━━ */}
      <MindWebLoader
        visible={showMindWeb}
        graphNodesDone={graphNodesDone}
        busy={busy}
        steps={steps}
        activities={activities}
        completedCount={doneCnt}
        totalCount={GRAPH_PIPELINE.length}
        onMinimize={() => setShowMindWeb(false)}
      />

      <div className="mx-auto w-full max-w-[1120px] px-4 py-5 sm:px-6">

      {/* ━━ TOP: Form card ━━ */}
      <div className="anim-fade-up overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm">
        {/* Title bar */}
        <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md shadow-indigo-300/30">
            <Sparkles size={14} />
          </div>
          <div className="flex-1">
            <h1 className="text-sm font-bold text-slate-900">New Campaign</h1>
            <p className="text-[10px] text-slate-400">Configure and launch your AI campaign engine</p>
          </div>
          {runId && (
            <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-400">{runId.slice(0, 8)}</code>
          )}
        </div>

        {/* Form */}
        <form onSubmit={(e) => void run(e)} className="p-5">
          {/* Row 1: Main fields */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto_auto]">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Brand *</label>
              <input name="brand_name" required className={inp} placeholder="e.g. Ettarra Coffee House" />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">URL</label>
              <input name="brand_url" className={inp} placeholder="https://..." />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Geo A</label>
              <input name="geo1" defaultValue="India" className={`${inp} w-28`} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Geo B</label>
              <input name="geo2" defaultValue="United States" className={`${inp} w-32`} />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Industry</label>
              <input name="industry" className={`${inp} w-36`} placeholder="e.g. Coffee" />
            </div>
          </div>

          {/* Instagram (metrics & benchmarking) */}
          <div className="mt-3">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Instagram</label>
            <div className="relative max-w-md">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400 text-sm">@</span>
              <input
                name="instagram_handle"
                className={`${inp} pl-7`}
                placeholder="yourbrand"
              />
            </div>
            <p className="mt-1 text-[10px] text-slate-400">
              Used for post metrics, comment sentiment, and competitor Instagram benchmarking.
            </p>
          </div>

          {/* Row 2: Brief + actions */}
          <div className="mt-3 flex gap-3 items-end">
            <div className="flex-1">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Brief</label>
              <textarea name="additional_context" rows={2} className={inp} placeholder="Positioning, ICP, tone..." />
            </div>
            <div className="flex flex-col items-end gap-2 pb-0.5">
              <label className="flex items-center gap-1.5 text-[11px] text-slate-500 whitespace-nowrap">
                <input type="checkbox" name="images" defaultChecked className="rounded border-slate-300 text-indigo-600 h-3.5 w-3.5" />
                Visuals
              </label>
              <button
                type="submit"
                disabled={busy}
                className="relative flex items-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-indigo-200/40 transition-all hover:shadow-xl hover:shadow-indigo-300/50 active:scale-[0.98] disabled:opacity-50 whitespace-nowrap"
              >
                {busy ? (
                  <>
                    <Spinner size={13} />
                    Running...
                    <span className="absolute inset-0 anim-shimmer" />
                  </>
                ) : (
                  <>
                    <Play size={12} fill="currentColor" />
                    Run campaign
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Alerts */}
          {banner && <div className="anim-fade-up mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{banner}</div>}
          {errors.length > 0 && <div className="anim-fade-up mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{errors.join(" · ")}</div>}
        </form>

        {/* Pipeline stepper */}
        {hasResults && (
          <div className="border-t border-slate-100 px-5 py-3">
            <WorkflowViz busy={busy} graphNodesDone={graphNodesDone} steps={steps} runId={runId} />
          </div>
        )}
      </div>

      {/* ━━ BOTTOM: Results ━━ */}
      {!hasResults ? (
        <EmptyState />
      ) : (
        <div className="mt-5 grid gap-5 lg:grid-cols-5">
          {/* Left: Agent stream (3/5 width) */}
          <div className="min-w-0 space-y-5 lg:col-span-3">
            <Section title="Agent Stream">
              <div className="max-h-[520px] space-y-2.5 overflow-y-auto pr-1 thin-scroll">
                {steps.map((s, i) => (
                  <AgentCard key={s.id} step={s} index={i} />
                ))}
                {!steps.length && busy && (
                  <div className="flex flex-col items-center gap-3 py-12">
                    <Spinner size={24} />
                    <p className="text-xs text-slate-400">Initializing agents...</p>
                  </div>
                )}
              </div>
            </Section>

            {/* Campaign overview */}
            {artifacts.executive_summary ? (
              <Section title="Campaign Overview">
                <p className="text-[13px] leading-relaxed text-slate-700">{String(artifacts.executive_summary)}</p>
                {imageUrls.length > 0 && (
                  <div className="mt-4 grid gap-3 grid-cols-2">
                    {imageUrls.map((u, i) => (
                      <div key={u + i} className="anim-fade-up overflow-hidden rounded-xl border border-slate-200" style={{ animationDelay: `${i * 0.1}s` }}>
                        <img src={u} alt={`Visual ${i + 1}`} className="aspect-[4/3] w-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            ) : null}
          </div>

          {/* Right sidebar (2/5 width) */}
          <div className="min-w-0 space-y-5 lg:col-span-2">
            {/* Agent network mini map */}
            <MindWebMini graphNodesDone={graphNodesDone} busy={busy} steps={steps} onExpand={() => setShowMindWeb(true)} />

            {/* Streaming artifacts */}
            {Object.keys(partial).length > 0 && (
              <Section title="Artifacts">
                <div className="space-y-1">
                  {Object.entries(partial)
                    .filter(([k]) => k !== "final_artifacts")
                    .map(([k, v]) => (
                      <details key={k} className="group">
                        <summary className="flex cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 transition hover:bg-slate-50 hover:text-indigo-600">
                          <ChevronRight size={11} className="transition-transform group-open:rotate-90" />
                          {k.replace(/_/g, " ")}
                        </summary>
                        <div className="mt-1 max-h-[280px] overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/50 p-3 thin-scroll">
                          <StructuredData value={v} />
                        </div>
                      </details>
                    ))}
                </div>
              </Section>
            )}

            {/* Sources */}
            <Section title="Cited Sources">
              <SourceList steps={result?.trace || steps} />
            </Section>
          </div>
        </div>
      )}
    </div>
    </>
  );
}
