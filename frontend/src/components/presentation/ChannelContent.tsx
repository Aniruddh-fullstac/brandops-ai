import type { ReactNode } from "react";
import { StructuredData } from "./StructuredData";

/** Prefer human-readable blocks for known campaign shapes; fall back to structured layout. */
export function ChannelContent({ data }: { data: unknown }): ReactNode {
  if (data === null || data === undefined) {
    return <p className="text-sm text-slate-500">No content for this section.</p>;
  }
  if (typeof data !== "object") {
    return <p className="text-sm text-slate-800">{String(data)}</p>;
  }

  const o = data as Record<string, unknown>;

  // SEO: surface keywords & pillars first
  if (Array.isArray(o.target_keywords) && o.target_keywords.length) {
    const rest = { ...o };
    delete rest.target_keywords;
    return (
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Target keywords</p>
          <div className="flex flex-wrap gap-2">
            {o.target_keywords.map((k: unknown, i: number) => (
              <span
                key={i}
                className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-900"
              >
                {typeof k === "object" && k && "keyword" in (k as object)
                  ? String((k as { keyword: string }).keyword)
                  : String(k)}
              </span>
            ))}
          </div>
        </div>
        <StructuredData value={rest} />
      </div>
    );
  }

  // Social: sample posts / hooks as cards if present
  const samples = o.samples || o.posts || o.hooks;
  if (Array.isArray(samples) && samples.length && typeof samples[0] === "object") {
    const rest = { ...o };
    delete rest.samples;
    delete rest.posts;
    delete rest.hooks;
    return (
      <div className="space-y-4">
        <div className="space-y-3">
          {(samples as Record<string, unknown>[]).map((item, i) => (
            <div key={i} className="rounded-xl border border-pink-100 bg-pink-50/40 p-4">
              <StructuredData value={item} />
            </div>
          ))}
        </div>
        {Object.keys(rest).length > 0 && <StructuredData value={rest} />}
      </div>
    );
  }

  // Video: concepts list
  if (Array.isArray(o.concepts) && o.concepts.length) {
    const rest = { ...o };
    delete rest.concepts;
    return (
      <div className="space-y-4">
        <div className="space-y-3">
          {(o.concepts as unknown[]).map((c, i) => (
            <div key={i} className="rounded-xl border border-rose-100 bg-rose-50/30 p-4">
              <StructuredData value={c} />
            </div>
          ))}
        </div>
        {Object.keys(rest).length > 0 && <StructuredData value={rest} />}
      </div>
    );
  }

  return <StructuredData value={o} />;
}
