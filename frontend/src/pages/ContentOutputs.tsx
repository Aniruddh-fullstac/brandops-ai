import { useMemo, useState } from "react";
import { useCampaignStore } from "../components/CampaignStore";
import { ScheduleItemCard } from "../components/content/ScheduleItemCard";
import { ChannelContent } from "../components/presentation/ChannelContent";
import { CritiquePanel } from "../components/presentation/CritiquePanel";
import { SourceFootnotes } from "../components/presentation/SourceFootnotes";
import {
  PLATFORM_LABEL,
  PLATFORM_ORDER,
  filterRows,
  normalizePlatform,
  rowsFromArtifact,
  type ContentScheduleArtifact,
} from "../lib/contentSchedule";
import { collectSources, sourceMatchers } from "../lib/traceSources";
import { Layers, LayoutGrid } from "lucide-react";

export default function ContentOutputs() {
  const { artifacts, hydrateLoading, steps } = useCampaignStore();
  const [platform, setPlatform] = useState<string>("all");

  const cs = (artifacts as { content_schedule?: ContentScheduleArtifact }).content_schedule;
  const rows = useMemo(() => rowsFromArtifact(cs || null), [cs]);
  const filtered = useMemo(() => filterRows(rows, platform), [rows, platform]);

  const imageUrls = ((artifacts as { image_urls?: string[] }).image_urls || []).filter(Boolean);
  const critique = (artifacts as { creative_critique?: Record<string, unknown> }).creative_critique;

  const platformsPresent = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) s.add(normalizePlatform(r.platform));
    return Array.from(s).sort((a, b) => {
      const ia = PLATFORM_ORDER.indexOf(a as (typeof PLATFORM_ORDER)[number]);
      const ib = PLATFORM_ORDER.indexOf(b as (typeof PLATFORM_ORDER)[number]);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [rows]);

  const tabSources = useMemo(() => {
    return collectSources(steps, (s) => sourceMatchers.creatives(s) || sourceMatchers.critic(s));
  }, [steps]);

  if (hydrateLoading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-16 text-center text-sm text-slate-500">Loading saved content…</div>
    );
  }

  const hasUnified = rows.length > 0;
  const overview = cs?.overview;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Content Studio</h1>
        <p className="mt-1 text-sm text-slate-600">
          Scheduled posts, emails, WhatsApp, push, and social — with captions, hashtags, and visual prompts in one place.
        </p>
      </div>

      {hasUnified && overview && (
        <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-white p-6 shadow-sm">
          <div className="flex items-center gap-2 text-indigo-700">
            <Layers size={20} />
            <h2 className="font-display text-sm font-bold uppercase tracking-wide">Campaign overview</h2>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-800">{overview}</p>
        </div>
      )}

      {hasUnified && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
            <LayoutGrid size={16} className="text-slate-400" />
            <span className="text-xs font-semibold text-slate-500">Filter by platform</span>
          </div>
          <div className="flex flex-wrap gap-2 p-4">
            <button
              type="button"
              onClick={() => setPlatform("all")}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                platform === "all" ? "bg-indigo-600 text-white shadow" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              All ({rows.length})
            </button>
            {platformsPresent.map((pid) => (
              <button
                key={pid}
                type="button"
                onClick={() => setPlatform(pid)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  platform === pid ? "bg-indigo-600 text-white shadow" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {PLATFORM_LABEL[pid] || pid} ({filterRows(rows, pid).length})
              </button>
            ))}
          </div>

          <div className="space-y-4 border-t border-slate-100 p-4">
            {filtered.length === 0 ? (
              <p className="text-center text-sm text-slate-500">No items for this filter.</p>
            ) : (
              filtered.map((row, i) => <ScheduleItemCard key={row.id || `${row.scheduled_at}-${i}`} row={row} />)
            )}
          </div>
          <div className="border-t border-slate-100 px-4 py-3">
            <SourceFootnotes sources={tabSources} />
          </div>
        </div>
      )}

      {!hasUnified && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5 text-sm text-amber-900">
          <strong>Unified schedule not found for this run.</strong> Run a new campaign to generate the cross-platform timeline
          (Instagram, LinkedIn, X, email, WhatsApp, push, etc.). Below are raw channel bundles from the graph.
        </div>
      )}

      {/* Legacy / raw bundles */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-display text-lg font-semibold text-slate-900">Channel bundles (reference)</h2>
        <p className="mt-1 text-xs text-slate-500">SEO, social JSON, video, and WhatsApp flows as produced by creative agents.</p>
        <div className="mt-4 space-y-6">
          {(["seo", "social", "video_concepts", "messaging_whatsapp"] as const).map((key) => {
            const data = (artifacts as Record<string, unknown>)[key];
            if (!data || typeof data !== "object") return null;
            return (
              <div key={key}>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">{key.replace(/_/g, " ")}</p>
                <ChannelContent data={data} />
              </div>
            );
          })}
        </div>
      </div>

      {imageUrls.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-slate-900">Campaign visuals</h2>
          <p className="mt-1 text-xs text-slate-500">Key art aligned to your strategy (use with scheduled posts where marked).</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {imageUrls.map((u, i) => (
              <div key={u + i} className="group relative overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
                <img src={u} alt={`Campaign visual ${i + 1}`} className="aspect-[4/3] w-full object-cover" />
                <a
                  href={u}
                  download
                  className="absolute bottom-2 right-2 rounded-lg bg-white/90 px-2.5 py-1 text-[10px] font-bold text-indigo-700 opacity-0 shadow backdrop-blur transition group-hover:opacity-100"
                >
                  Download
                </a>
              </div>
            ))}
          </div>
          <SourceFootnotes sources={collectSources(steps, (s) => sourceMatchers.visuals(s))} />
        </div>
      )}

      {critique && Object.keys(critique).length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-slate-900">Creative QA</h2>
          <div className="mt-4">
            <CritiquePanel critique={critique} />
          </div>
          <SourceFootnotes sources={collectSources(steps, (s) => sourceMatchers.critic(s))} />
        </div>
      )}

    </div>
  );
}
