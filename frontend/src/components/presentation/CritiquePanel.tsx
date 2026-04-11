import { StructuredData } from "./StructuredData";

export function CritiquePanel({ critique }: { critique: Record<string, unknown> }) {
  const scores = critique.scores as Record<string, number> | undefined;
  const issues = critique.issues as { channel?: string; severity?: string; fix?: string }[] | undefined;
  const directives = critique.revision_directives as string[] | undefined;
  const verdict = critique.final_verdict as string | undefined;

  return (
    <div className="space-y-6">
      {verdict && (
        <blockquote className="rounded-xl border-l-4 border-indigo-400 bg-indigo-50/60 px-4 py-3 text-sm leading-relaxed text-slate-800">
          {verdict}
        </blockquote>
      )}

      {scores && Object.keys(scores).length > 0 && (
        <div>
          <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">Channel scores</p>
          <div className="space-y-2">
            {Object.entries(scores).map(([ch, sc]) => (
              <div key={ch} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-xs font-medium capitalize text-slate-700">{ch}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-teal-500 to-indigo-500"
                    style={{ width: `${Math.min(100, Math.max(0, Number(sc)))}%` }}
                  />
                </div>
                <span className="w-10 text-right text-xs font-bold tabular-nums text-slate-800">{sc}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {issues && issues.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Issues flagged</p>
          <ul className="space-y-2">
            {issues.map((iss, i) => (
              <li key={i} className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {typeof iss === "object" && iss !== null ? (
                  <StructuredData value={iss as Record<string, unknown>} />
                ) : (
                  String(iss)
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {directives && directives.length > 0 && (
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Revision directives</p>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-slate-700">
            {directives.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ol>
        </div>
      )}

      {/* Remaining fields */}
      <StructuredData
        value={{
          ...Object.fromEntries(
            Object.entries(critique).filter(([k]) => !["scores", "issues", "revision_directives", "final_verdict"].includes(k))
          ),
        }}
      />
    </div>
  );
}
