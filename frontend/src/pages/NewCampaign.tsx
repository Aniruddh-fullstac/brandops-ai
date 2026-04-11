import { useCallback } from "react";
import { WorkflowViz } from "../components/WorkflowViz";
import { rememberLastCampaignId, useCampaignStore } from "../components/CampaignStore";
import { StructuredData } from "../components/presentation/StructuredData";
import { apiFetch } from "../lib/api";
import type { StreamEvent, TraceStep } from "../types";

function SourceList({ steps }: { steps: TraceStep[] }) {
  const seen = new Map<string, { url: string; title?: string | null }>();
  for (const s of steps)
    for (const x of s.sources || [])
      if (x.url && !seen.has(x.url)) seen.set(x.url, x);
  const sources = [...seen.values()];
  if (!sources.length)
    return <p className="text-sm text-slate-500">Citations appear as research agents finish.</p>;
  return (
    <ul className="space-y-2">
      {sources.map((s) => (
        <li key={s.url}>
          <a href={s.url} target="_blank" rel="noreferrer" className="text-sm font-medium text-indigo-600 hover:underline">
            {s.title || s.url}
          </a>
          <div className="truncate text-xs text-slate-400">{s.url}</div>
        </li>
      ))}
    </ul>
  );
}

export default function NewCampaign() {
  const store = useCampaignStore();
  const { busy, steps, graphNodesDone, runId, partial, result, errors, banner, artifacts } = store;

  const run = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      const brandName = (fd.get("brand_name") as string)?.trim();
      if (!brandName) {
        store.setBanner("Brand name is required.");
        return;
      }
      store.reset();
      store.setBusy(true);
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
        const res = await apiFetch("/api/campaigns/stream", {
          method: "POST",
          body: JSON.stringify(body),
        });
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
              // Refine is skipped when critic scores are high; mark it done when the next stage runs.
              if (evt.payload.node === "post_critic_parallel") store.addGraphNode("refine");
            }
            if (evt.event === "step_completed") store.addStep(evt.payload.step);
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

  const ic = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200";

  const imageUrls = ((artifacts as { image_urls?: string[] }).image_urls || []).filter(Boolean);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">New Campaign</h1>
        <p className="mt-1 text-sm text-slate-600">Enter brand details and watch 14 agents orchestrate in real time.</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[380px_1fr]">
        {/* Input form */}
        <form onSubmit={(e) => void run(e)} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Brand name *
            <input name="brand_name" required className={ic} placeholder="e.g. Ettarra Coffee House" />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Brand URL
            <input name="brand_url" className={ic} placeholder="https://..." />
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Instagram handle
            <div className="relative mt-1">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400 text-sm">@</span>
              <input
                name="instagram_handle"
                className={`${ic} pl-7 mt-0`}
                placeholder="yourbrand"
              />
            </div>
            <span className="text-[10px] font-normal normal-case text-slate-400">
              Used for post metrics, comment sentiment &amp; competitor Instagram benchmarking.
            </span>
          </label>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Documents / brief
            <textarea name="additional_context" rows={4} className={ic} placeholder="Positioning, ICP, tone…" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Geo A
              <input name="geo1" defaultValue="India" className={ic} />
            </label>
            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Geo B
              <input name="geo2" defaultValue="United States" className={ic} />
            </label>
          </div>
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Industry
            <input name="industry" className={ic} placeholder="e.g. Specialty coffee" />
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="images" defaultChecked className="rounded border-slate-300 text-indigo-600" />
            Generate key visuals
          </label>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-indigo-600 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-200/50 transition hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? "Running agents…" : "Run campaign graph"}
          </button>
          {banner && <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{banner}</div>}
          {errors.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{errors.join(" · ")}</div>
          )}
        </form>

        {/* Streaming results */}
        <div className="space-y-6">
          <WorkflowViz busy={busy} graphNodesDone={graphNodesDone} steps={steps} runId={runId} />

          {/* Agent trace */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-display text-lg font-semibold text-slate-900">Agent stream</h2>
            <div className="mt-4 grid max-h-[380px] gap-3 overflow-y-auto md:grid-cols-2">
              {steps.map((s) => (
                <article key={s.id} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 hover:border-indigo-200">
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-md bg-teal-100 px-2 py-0.5 text-[10px] font-bold uppercase text-teal-800">
                      {s.phase}
                    </span>
                    <span className="truncate text-[10px] text-slate-400">{s.agent}</span>
                  </div>
                  <h3 className="mt-2 font-semibold text-slate-900">{s.title}</h3>
                  {s.summary && <p className="mt-1 text-sm text-slate-600">{s.summary}</p>}
                  {s.reasoning && <p className="mt-1 text-xs text-slate-500">{s.reasoning}</p>}
                  {!!s.tool_calls?.length && (
                    <p className="mt-1 text-xs text-slate-400">Tools: {s.tool_calls.map((t) => t.name).join(", ")}</p>
                  )}
                  {!!s.web_queries?.length && (
                    <p className="mt-1 text-[11px] text-slate-400">Queries: {s.web_queries.slice(0, 3).join(" · ")}</p>
                  )}
                </article>
              ))}
              {!steps.length && !busy && <p className="text-sm text-slate-500">Submit a brief to stream agent work.</p>}
            </div>
          </div>

          {/* Artifacts quick look + images */}
          {(artifacts.executive_summary || imageUrls.length > 0) && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              {artifacts.executive_summary && (
                <>
                  <h2 className="font-display text-lg font-semibold text-slate-900">Executive Summary</h2>
                  <p className="mt-2 text-sm leading-relaxed text-slate-700">{String(artifacts.executive_summary)}</p>
                </>
              )}
              {imageUrls.length > 0 && (
                <div className="mt-6">
                  <h3 className="font-display text-base font-semibold text-slate-900">Generated Visuals</h3>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    {imageUrls.map((u, i) => (
                      <div key={u + i} className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
                        <img src={u} alt={`Visual ${i + 1}`} className="aspect-[4/3] w-full object-cover" />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Partial artifacts JSON */}
          {Object.keys(partial).length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="font-display text-lg font-semibold text-slate-900">Streaming Artifacts</h2>
              <div className="mt-3 space-y-3">
                {Object.entries(partial)
                  .filter(([k]) => k !== "final_artifacts")
                  .map(([k, v]) => (
                    <details key={k} className="group">
                      <summary className="cursor-pointer rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold uppercase text-slate-600 hover:bg-indigo-50">
                        {k.replace(/_/g, " ")}
                      </summary>
                      <div className="mt-2 max-h-[420px] overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/50 p-4">
                        <StructuredData value={v} />
                      </div>
                    </details>
                  ))}
              </div>
            </div>
          )}

          {/* Sources */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-display text-lg font-semibold text-slate-900">Cited Sources</h2>
            <div className="mt-3">
              <SourceList steps={result?.trace || steps} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
