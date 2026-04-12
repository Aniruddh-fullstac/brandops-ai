import { useMemo, useState } from "react";
import { GitCompare } from "lucide-react";

type Highlight = {
  channel?: string;
  issue?: string;
  original_snippet?: string;
  revised_snippet?: string;
};

function asHighlights(raw: unknown): Highlight[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => x && typeof x === "object") as Highlight[];
}

function prettyJson(v: unknown): string {
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

export function CreativeDraftDiff({
  originalCreatives,
  refinedCreatives,
  deliveredSeo,
  deliveredSocial,
}: {
  originalCreatives: Record<string, unknown>;
  refinedCreatives: Record<string, unknown>;
  deliveredSeo: unknown;
  deliveredSocial: unknown;
}) {
  const [tab, setTab] = useState<"highlights" | "channels">("highlights");
  const highlights = useMemo(
    () => asHighlights(refinedCreatives.before_after_highlights),
    [refinedCreatives],
  );
  const origSeo = originalCreatives.seo;
  const origSocial = originalCreatives.social;
  const refSeo = refinedCreatives.seo ?? deliveredSeo;
  const refSocial = refinedCreatives.social ?? deliveredSocial;

  const hasHighlights = highlights.length > 0;
  const hasChannelDiff =
    (origSeo != null && refSeo != null) || (origSocial != null && refSocial != null);

  if (!hasHighlights && !hasChannelDiff) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <GitCompare size={18} className="text-indigo-500" />
          <h2 className="font-display text-lg font-semibold text-slate-900">Draft comparison</h2>
        </div>
        <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-[11px] font-semibold">
          <button
            type="button"
            disabled={!hasHighlights}
            onClick={() => setTab("highlights")}
            className={`rounded-md px-3 py-1.5 transition ${
              tab === "highlights"
                ? "bg-white text-indigo-700 shadow-sm"
                : "text-slate-500 hover:text-slate-700 disabled:opacity-40"
            }`}
          >
            Snippet diff
          </button>
          <button
            type="button"
            disabled={!hasChannelDiff}
            onClick={() => setTab("channels")}
            className={`rounded-md px-3 py-1.5 transition ${
              tab === "channels"
                ? "bg-white text-indigo-700 shadow-sm"
                : "text-slate-500 hover:text-slate-700 disabled:opacity-40"
            }`}
          >
            Channel JSON
          </button>
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Original draft vs refined delivery (after critic-driven edits). Delivered bundles match the refined column when
        refinement ran.
      </p>

      {tab === "highlights" && hasHighlights && (
        <ul className="mt-4 space-y-3">
          {highlights.map((h, i) => (
            <li key={i} className="rounded-xl border border-slate-100 bg-slate-50/80 p-4 text-sm">
              <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                {h.channel && <span className="rounded bg-white px-2 py-0.5 text-indigo-600">{h.channel}</span>}
                {h.issue && <span className="text-slate-500">{h.issue}</span>}
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <p className="text-[10px] font-bold uppercase text-rose-600">Before</p>
                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-rose-100 bg-white p-2 text-xs text-slate-700">
                    {h.original_snippet || "—"}
                  </pre>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase text-teal-600">After</p>
                  <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-teal-100 bg-white p-2 text-xs text-slate-700">
                    {h.revised_snippet || "—"}
                  </pre>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {tab === "channels" && hasChannelDiff && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {origSeo != null && refSeo != null && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">SEO bundle</p>
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <p className="text-[9px] font-bold uppercase text-rose-600">Original</p>
                  <pre className="mt-1 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2 text-[10px] leading-relaxed text-slate-700">
                    {prettyJson(origSeo)}
                  </pre>
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase text-teal-600">Refined</p>
                  <pre className="mt-1 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2 text-[10px] leading-relaxed text-slate-700">
                    {prettyJson(refSeo)}
                  </pre>
                </div>
              </div>
            </div>
          )}
          {origSocial != null && refSocial != null && (
            <div className="space-y-2 lg:col-span-2">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Social bundle</p>
              <div className="grid gap-2 md:grid-cols-2">
                <div>
                  <p className="text-[9px] font-bold uppercase text-rose-600">Original</p>
                  <pre className="mt-1 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2 text-[10px] leading-relaxed text-slate-700">
                    {prettyJson(origSocial)}
                  </pre>
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase text-teal-600">Refined</p>
                  <pre className="mt-1 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2 text-[10px] leading-relaxed text-slate-700">
                    {prettyJson(refSocial)}
                  </pre>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
