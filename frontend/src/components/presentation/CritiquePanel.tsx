import { StructuredData } from "./StructuredData";
import { ChevronRight, ClipboardList, Gauge, MessageSquareWarning } from "lucide-react";

function issueSeverityClass(sev: string | undefined) {
  const s = (sev || "").toLowerCase();
  if (s === "high" || s === "critical") return "border-rose-200 bg-rose-50/80";
  if (s === "medium") return "border-amber-200 bg-amber-50/70";
  return "border-slate-200 bg-slate-50/80";
}

export function CritiquePanel({ critique }: { critique: Record<string, unknown> }) {
  const scores = critique.scores as Record<string, number> | undefined;
  const issues = critique.issues as { channel?: string; severity?: string; fix?: string }[] | undefined;
  const directives = critique.revision_directives as string[] | undefined;
  const verdict = critique.final_verdict as string | undefined;

  const scoreEntries = scores ? Object.entries(scores) : [];
  const avg =
    scoreEntries.length > 0
      ? Math.round(scoreEntries.reduce((a, [, v]) => a + Number(v), 0) / scoreEntries.length)
      : null;

  const remainder = Object.fromEntries(
    Object.entries(critique).filter(([k]) => !["scores", "issues", "revision_directives", "final_verdict"].includes(k))
  );
  const hasRemainder = Object.keys(remainder).length > 0;

  return (
    <div className="space-y-6">
      {verdict && (
        <div className="relative overflow-hidden rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50 via-white to-violet-50/50 p-5 shadow-sm">
          <div className="absolute right-0 top-0 h-24 w-24 translate-x-6 -translate-y-6 rounded-full bg-indigo-200/30 blur-2xl" />
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">Verdict</p>
          <p className="relative mt-2 text-sm font-medium leading-relaxed text-slate-800">{verdict}</p>
        </div>
      )}

      {avg !== null && (
        <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-indigo-600 text-lg font-bold text-white shadow-md shadow-teal-200/40">
            {avg}
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Average QA score</p>
            <p className="text-sm text-slate-600">Across {scoreEntries.length} channel{scoreEntries.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
      )}

      {scoreEntries.length > 0 && (
        <div>
          <p className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <Gauge size={14} className="text-indigo-500" />
            Channel scores
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {scoreEntries.map(([ch, sc]) => {
              const n = Math.min(100, Math.max(0, Number(sc)));
              return (
                <div
                  key={ch}
                  className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold capitalize text-slate-800">{ch}</span>
                    <span className="text-lg font-bold tabular-nums text-slate-900">{sc}</span>
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200/80">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-teal-400 to-indigo-500"
                      style={{ width: `${n}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {issues && issues.length > 0 && (
        <div>
          <p className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <MessageSquareWarning size={14} className="text-amber-500" />
            Issues flagged
          </p>
          <ul className="space-y-2">
            {issues.map((iss, i) => (
              <li
                key={i}
                className={`rounded-xl border px-4 py-3 text-sm shadow-sm ${issueSeverityClass(iss.severity)}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {iss.channel && (
                    <span className="rounded-md bg-white/80 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-600">
                      {iss.channel}
                    </span>
                  )}
                  {iss.severity && (
                    <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-bold capitalize text-slate-700">
                      {iss.severity}
                    </span>
                  )}
                </div>
                <div className="mt-2 text-slate-800">
                  {typeof iss === "object" && iss !== null ? (
                    <StructuredData value={iss as Record<string, unknown>} />
                  ) : (
                    String(iss)
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {directives && directives.length > 0 && (
        <div>
          <p className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            <ClipboardList size={14} className="text-violet-500" />
            Revision directives
          </p>
          <ol className="grid gap-2 sm:grid-cols-1">
            {directives.map((d, i) => (
              <li
                key={i}
                className="flex gap-3 rounded-xl border border-violet-100 bg-violet-50/40 px-4 py-3 text-sm leading-relaxed text-slate-800"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-xs font-bold text-white">
                  {i + 1}
                </span>
                <span className="pt-0.5">{d}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {hasRemainder && (
        <details className="group rounded-xl border border-slate-200 bg-slate-50/50">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-500 transition hover:text-slate-700">
            <ChevronRight size={14} className="shrink-0 transition-transform group-open:rotate-90" />
            Additional critic fields
          </summary>
          <div className="border-t border-slate-200 bg-white px-4 py-3">
            <StructuredData value={remainder} />
          </div>
        </details>
      )}
    </div>
  );
}
