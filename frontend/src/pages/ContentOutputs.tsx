import { useMemo, useState } from "react";
import { useCampaignStore } from "../components/CampaignStore";
import { ChannelContent } from "../components/presentation/ChannelContent";
import { CritiquePanel } from "../components/presentation/CritiquePanel";
import { SourceFootnotes } from "../components/presentation/SourceFootnotes";
import { collectSources, sourceMatchers } from "../lib/traceSources";
import type { TraceStep } from "../types";

const TABS = [
  { id: "seo", label: "SEO" },
  { id: "social", label: "Social" },
  { id: "video_concepts", label: "Video" },
  { id: "messaging_whatsapp", label: "WhatsApp" },
  { id: "localized", label: "Localized" },
  { id: "refined_creatives", label: "Refined" },
] as const;

function sourcesForTab(tab: (typeof TABS)[number]["id"], steps: TraceStep[]) {
  const c = collectSources;
  switch (tab) {
    case "seo":
      return c(steps, (s) => sourceMatchers.seo(s) || sourceMatchers.creatives(s) || sourceMatchers.strategy(s));
    case "social":
      return c(steps, (s) => sourceMatchers.creatives(s) || sourceMatchers.researchSocial(s));
    case "video_concepts":
      return c(steps, (s) => sourceMatchers.creatives(s));
    case "messaging_whatsapp":
      return c(steps, (s) => sourceMatchers.creatives(s));
    case "localized":
      return c(steps, (s) => sourceMatchers.localize(s) || sourceMatchers.strategy(s));
    case "refined_creatives":
      return c(steps, (s) => sourceMatchers.critic(s) || sourceMatchers.creatives(s));
    default:
      return c(steps, () => true);
  }
}

export default function ContentOutputs() {
  const { artifacts, hydrateLoading, steps } = useCampaignStore();
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("seo");
  const data = (artifacts as Record<string, unknown>)[tab];
  const imageUrls = ((artifacts as { image_urls?: string[] }).image_urls || []).filter(Boolean);
  const critique = (artifacts as { creative_critique?: Record<string, unknown> }).creative_critique;

  const tabSources = useMemo(() => sourcesForTab(tab, steps), [tab, steps]);

  if (hydrateLoading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-16 text-center text-sm text-slate-500">Loading saved content…</div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Content Outputs</h1>
        <p className="mt-1 text-sm text-slate-600">Channel-ready assets with trace-linked references.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap gap-1 border-b border-slate-100 px-6 pt-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`rounded-t-xl px-4 py-2.5 text-xs font-semibold transition ${
                tab === t.id ? "border-b-2 border-indigo-600 text-indigo-700" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="p-6">
          {data && typeof data === "object" && Object.keys(data as object).length > 0 ? (
            <>
              <ChannelContent data={data} />
              <SourceFootnotes sources={tabSources} />
            </>
          ) : (
            <p className="text-sm text-slate-500">No content for this channel yet. Run a campaign first.</p>
          )}
        </div>
      </div>

      {imageUrls.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-slate-900">Campaign visuals</h2>
          <p className="mt-1 text-xs text-slate-500">Generated key art (saved with your run).</p>
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
          <h2 className="font-display text-lg font-semibold text-slate-900">Creative QA & critique</h2>
          <p className="mt-1 text-xs text-slate-500">Cross-channel review before localization.</p>
          <div className="mt-4">
            <CritiquePanel critique={critique} />
          </div>
          <SourceFootnotes sources={collectSources(steps, (s) => sourceMatchers.critic(s))} />
        </div>
      )}
    </div>
  );
}
