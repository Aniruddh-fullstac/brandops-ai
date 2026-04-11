import { useState } from "react";
import { useCampaignStore } from "../components/CampaignStore";

const TABS = [
  { id: "seo", label: "SEO" },
  { id: "social", label: "Social" },
  { id: "video_concepts", label: "Video" },
  { id: "messaging_whatsapp", label: "WhatsApp" },
  { id: "localized", label: "Localized" },
  { id: "refined_creatives", label: "Refined" },
] as const;

export default function ContentOutputs() {
  const { artifacts, hydrateLoading } = useCampaignStore();
  const [tab, setTab] = useState("seo");
  const data = (artifacts as Record<string, unknown>)[tab];
  const imageUrls = ((artifacts as { image_urls?: string[] }).image_urls || []).filter(Boolean);

  if (hydrateLoading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-16 text-center text-sm text-slate-500">Loading saved content…</div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Content Outputs</h1>
        <p className="mt-1 text-sm text-slate-600">All generated campaign content, organised by channel.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap gap-1 border-b border-slate-100 px-6 pt-4">
          {TABS.map((t) => (
            <button
              key={t.id}
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
          {data ? (
            <pre className="max-h-[500px] overflow-auto rounded-xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-700">
              {JSON.stringify(data, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-slate-500">No content for this channel yet. Run a campaign first.</p>
          )}
        </div>
      </div>

      {/* Images */}
      {imageUrls.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-slate-900">Campaign Visuals</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {imageUrls.map((u, i) => (
              <div key={u + i} className="group relative overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
                <img src={u} alt={`Visual ${i + 1}`} className="aspect-[4/3] w-full object-cover" />
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
        </div>
      )}

      {/* Critique */}
      {(artifacts as { creative_critique?: unknown }).creative_critique && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-slate-900">Creative QA / Critique</h2>
          <pre className="mt-3 max-h-[350px] overflow-auto rounded-xl bg-slate-50 p-4 text-xs text-slate-700">
            {JSON.stringify((artifacts as { creative_critique: unknown }).creative_critique, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
