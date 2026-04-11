import { useMemo, useState } from "react";
import { useCampaignStore } from "../components/CampaignStore";
import { ScheduleItemCard } from "../components/content/ScheduleItemCard";
import { SourceFootnotes } from "../components/presentation/SourceFootnotes";
import {
  PLATFORM_LABEL,
  filterRows,
  normalizePlatform,
  rowsFromArtifact,
  type ContentScheduleArtifact,
} from "../lib/contentSchedule";
import { collectSources, sourceMatchers } from "../lib/traceSources";
import { CalendarDays, CalendarRange, List } from "lucide-react";

type CalData = {
  days?: { date: string; weekday: string; phase: string; events: { channel: string; time: string; format: string }[] }[];
  summary?: { total_events: number; by_channel: Record<string, number>; start_date?: string; duration_days?: number };
};

const CH_COLORS: Record<string, string> = {
  linkedin: "bg-blue-100 text-blue-800",
  instagram: "bg-pink-100 text-pink-800",
  twitter: "bg-slate-800 text-white",
  tiktok: "bg-violet-100 text-violet-800",
  blog: "bg-emerald-100 text-emerald-800",
  email: "bg-amber-100 text-amber-800",
  whatsapp: "bg-green-100 text-green-800",
  push_notification: "bg-orange-100 text-orange-800",
  seo: "bg-cyan-100 text-cyan-800",
  video: "bg-rose-100 text-rose-800",
};

export default function CampaignCalendar() {
  const { artifacts, hydrateLoading, steps } = useCampaignStore();
  const [view, setView] = useState<"timeline" | "grid">("timeline");
  const [platform, setPlatform] = useState<string>("all");

  const cs = (artifacts as { content_schedule?: ContentScheduleArtifact }).content_schedule;
  const scheduleRows = useMemo(() => rowsFromArtifact(cs || null), [cs]);
  const filtered = useMemo(() => filterRows(scheduleRows, platform), [scheduleRows, platform]);

  const calendar = (artifacts as { campaign_calendar?: CalData }).campaign_calendar;
  const summary = calendar?.summary;

  const byDate = useMemo(() => {
    const m = new Map<string, typeof filtered>();
    for (const r of filtered) {
      let key = "—";
      if (r.scheduled_at) {
        try {
          const d = new Date(r.scheduled_at);
          if (!Number.isNaN(d.getTime())) key = d.toISOString().slice(0, 10);
        } catch {
          key = String(r.scheduled_at).slice(0, 10);
        }
      }
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const platformsPresent = useMemo(() => {
    const s = new Set<string>();
    for (const r of scheduleRows) s.add(normalizePlatform(r.platform));
    return Array.from(s);
  }, [scheduleRows]);

  if (hydrateLoading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-16 text-center text-sm text-slate-500">Loading calendar…</div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Campaign calendar</h1>
        <p className="mt-1 text-sm text-slate-600">
          {scheduleRows.length > 0
            ? "Scroll the unified schedule — every slot includes time, platform, copy, hashtags, and asset notes."
            : "Deterministic 30-day channel rhythm from the timing engine. Run a new campaign for rich scheduled copy."}
        </p>
      </div>

      {scheduleRows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setView("timeline")}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${
                view === "timeline" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              <List size={14} /> By date
            </button>
            <button
              type="button"
              onClick={() => setView("grid")}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${
                view === "grid" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              <CalendarRange size={14} /> All items
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800"
            >
              <option value="all">All platforms ({scheduleRows.length})</option>
              {platformsPresent.map((p) => (
                <option key={p} value={p}>
                  {PLATFORM_LABEL[p] || p} ({filterRows(scheduleRows, p).length})
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {scheduleRows.length > 0 && view === "timeline" && (
        <div className="space-y-8">
          {byDate.map(([date, items]) => (
            <section key={date}>
              <h2 className="mb-3 flex items-center gap-2 font-display text-sm font-bold uppercase tracking-wide text-slate-500">
                <CalendarDays size={16} className="text-indigo-500" />
                {date}
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold normal-case text-slate-600">
                  {items.length} slot{items.length === 1 ? "" : "s"}
                </span>
              </h2>
              <div className="space-y-3">
                {items.map((row, i) => (
                  <ScheduleItemCard key={row.id || `${date}-${i}`} row={row} compact />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {scheduleRows.length > 0 && view === "grid" && (
        <div className="space-y-3">
          {filtered.map((row, i) => (
            <ScheduleItemCard key={row.id || `g-${i}`} row={row} compact />
          ))}
        </div>
      )}

      {scheduleRows.length > 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 p-4">
          <SourceFootnotes
            sources={collectSources(steps, (s) => sourceMatchers.creatives(s) || sourceMatchers.strategy(s))}
          />
        </div>
      )}

      {/* Deterministic engine strip */}
      {calendar?.days && calendar.days.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-slate-900">Channel rhythm (engine)</h2>
          <p className="mt-1 text-xs text-slate-500">
            Optimal posting windows — {summary?.total_events ?? 0} events over {summary?.duration_days ?? 30} days
            {summary?.start_date ? ` starting ${summary.start_date}` : ""}.
          </p>
          {summary?.by_channel && (
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(summary.by_channel).map(([ch, count]) => (
                <span
                  key={ch}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${CH_COLORS[ch] || "bg-slate-100 text-slate-700"}`}
                >
                  {ch} · {count}
                </span>
              ))}
            </div>
          )}
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {calendar.days.map((day) => (
              <div
                key={day.date}
                className={`rounded-xl border p-3 text-left shadow-sm ${
                  day.events.length > 0 ? "border-slate-200 bg-white" : "border-slate-100 bg-slate-50/50 opacity-70"
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-[11px] font-bold text-slate-800">
                    {day.weekday} {day.date.slice(5)}
                  </span>
                  <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-600">{day.phase}</span>
                </div>
                {day.events.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {day.events.map((ev, i) => (
                      <li key={i} className="text-[10px] text-slate-600">
                        <span className="font-semibold text-slate-800">{ev.channel}</span> · {ev.time}
                        {ev.format ? ` · ${ev.format}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[10px] text-slate-400">No engine slot</p>
                )}
              </div>
            ))}
          </div>
          <SourceFootnotes sources={collectSources(steps, (s) => sourceMatchers.timing(s))} />
        </div>
      )}

      {!calendar?.days?.length && scheduleRows.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <CalendarDays className="mx-auto text-slate-300" size={40} />
          <p className="mt-3 text-sm text-slate-500">Run a campaign to generate your calendar and scheduled content.</p>
        </div>
      )}
    </div>
  );
}
