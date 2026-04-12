import { useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, Sparkles, Users } from "lucide-react";

type Conflict = {
  signal_a?: string;
  signal_b?: string;
  description?: string;
  severity?: string;
};

type Resolution = {
  unified_tone?: string;
  messaging_guardrails?: string[];
  segment_tone_overrides?: { segment_name?: string; note?: string }[];
  notes_for_creatives?: string;
};

function severityStyle(sev: string | undefined) {
  const s = (sev || "").toLowerCase();
  if (s === "high")
    return "border-rose-200 bg-rose-50/90 text-rose-900";
  if (s === "medium")
    return "border-amber-200 bg-amber-50/90 text-amber-900";
  return "border-slate-200 bg-slate-50/90 text-slate-800";
}

export function MemoryResolutionPanel({ data }: { data: Record<string, unknown> }) {
  const [showRaw, setShowRaw] = useState(false);
  const conflicts = (Array.isArray(data.conflicts) ? data.conflicts : []) as Conflict[];
  const resolution = (typeof data.resolution === "object" && data.resolution !== null
    ? data.resolution
    : {}) as Resolution;
  const summary = typeof data.reasoning_summary === "string" ? data.reasoning_summary : "";

  const guardrails = Array.isArray(resolution.messaging_guardrails)
    ? resolution.messaging_guardrails.map(String).filter(Boolean)
    : [];
  const overrides = Array.isArray(resolution.segment_tone_overrides) ? resolution.segment_tone_overrides : [];

  const hasStructured =
    conflicts.length > 0 ||
    guardrails.length > 0 ||
    overrides.length > 0 ||
    Boolean(resolution.unified_tone) ||
    Boolean(resolution.notes_for_creatives);

  return (
    <div className="overflow-hidden rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-50/50 via-white to-fuchsia-50/30 shadow-sm">
      <div className="border-b border-violet-100/80 bg-white/60 px-5 py-4 backdrop-blur-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-lg shadow-violet-200/50">
              <Sparkles size={22} />
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900">Cross-agent memory</h2>
              <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-slate-600">
                Conflicts across strategy, research, and social signals were reconciled before creatives ran.
              </p>
            </div>
          </div>
          {conflicts.length > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-bold text-amber-900">
              <AlertTriangle size={12} />
              {conflicts.length} conflict{conflicts.length !== 1 ? "s" : ""} resolved
            </span>
          )}
        </div>
        {summary && (
          <p className="mt-4 rounded-xl border border-violet-100/80 bg-white/80 px-4 py-3 text-sm leading-relaxed text-slate-700">
            {summary}
          </p>
        )}
      </div>

      <div className="grid gap-4 p-5 lg:grid-cols-2">
        {conflicts.length > 0 && (
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <AlertTriangle size={14} className="text-amber-500" />
              Flagged tensions
            </h3>
            <ul className="space-y-2">
              {conflicts.map((c, i) => (
                <li
                  key={i}
                  className={`rounded-xl border px-4 py-3 text-sm shadow-sm ${severityStyle(c.severity)}`}
                >
                  {(c.signal_a || c.signal_b) && (
                    <p className="mb-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-wide opacity-90">
                      {c.signal_a && (
                        <span className="rounded-md bg-white/70 px-2 py-0.5">{c.signal_a}</span>
                      )}
                      {c.signal_a && c.signal_b && <span className="text-slate-400">vs</span>}
                      {c.signal_b && (
                        <span className="rounded-md bg-white/70 px-2 py-0.5">{c.signal_b}</span>
                      )}
                    </p>
                  )}
                  <p className="leading-relaxed">{c.description || "—"}</p>
                  {c.severity && (
                    <span className="mt-2 inline-block rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-bold capitalize">
                      {c.severity}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {(resolution.unified_tone || guardrails.length > 0 || resolution.notes_for_creatives) && (
          <div className="space-y-4">
            <h3 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <CheckCircle2 size={14} className="text-teal-600" />
              Unified guardrails
            </h3>
            {resolution.unified_tone && (
              <div className="rounded-xl border border-teal-100 bg-gradient-to-br from-teal-50/80 to-white p-4 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-wide text-teal-700">Tone</p>
                <p className="mt-1.5 text-sm font-medium leading-relaxed text-slate-800">{resolution.unified_tone}</p>
              </div>
            )}
            {guardrails.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase text-slate-400">Messaging guardrails</p>
                <ul className="flex flex-wrap gap-2">
                  {guardrails.map((g, i) => (
                    <li
                      key={i}
                      className="max-w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium leading-snug text-slate-700 shadow-sm"
                    >
                      {g}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {resolution.notes_for_creatives && (
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
                <p className="text-[10px] font-bold uppercase text-indigo-700">Notes for creatives</p>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-800">{resolution.notes_for_creatives}</p>
              </div>
            )}
          </div>
        )}

        {overrides.length > 0 && (
          <div className="lg:col-span-2">
            <h3 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <Users size={14} className="text-indigo-500" />
              Segment tone overrides
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {overrides.map((o, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-indigo-100/80 bg-white p-4 shadow-sm"
                >
                  <p className="font-semibold text-slate-900">{o.segment_name || `Segment ${i + 1}`}</p>
                  <p className="mt-2 text-xs leading-relaxed text-slate-600">{o.note || "—"}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {!hasStructured && (
        <div className="border-t border-violet-100 px-5 py-4">
          <p className="text-sm text-slate-600">No structured conflicts in this payload — expand raw data if needed.</p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowRaw((v) => !v)}
        className="flex w-full items-center justify-center gap-2 border-t border-violet-100 bg-slate-50/80 px-4 py-2.5 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
      >
        <ChevronDown size={14} className={showRaw ? "rotate-180" : ""} />
        {showRaw ? "Hide raw JSON" : "View raw JSON"}
      </button>
      {showRaw && (
        <div className="border-t border-violet-100 bg-slate-900 px-4 py-3">
          <pre className="max-h-56 overflow-auto text-[10px] leading-relaxed text-emerald-100/90">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
