import { useCampaignStore } from "../components/CampaignStore";
import { CalendarDays } from "lucide-react";

const CH_COLORS: Record<string, string> = {
  linkedin: "bg-blue-100 text-blue-800",
  instagram: "bg-pink-100 text-pink-800",
  tiktok: "bg-violet-100 text-violet-800",
  blog: "bg-emerald-100 text-emerald-800",
  email: "bg-amber-100 text-amber-800",
  whatsapp: "bg-green-100 text-green-800",
  seo: "bg-cyan-100 text-cyan-800",
  video: "bg-rose-100 text-rose-800",
};

type DayEvent = { channel: string; time: string; format: string; phase: string; priority: string };
type CalDay = { date: string; weekday: string; phase: string; events: DayEvent[] };
type CalData = { days?: CalDay[]; summary?: { total_events: number; by_channel: Record<string, number> } };

export default function CampaignCalendar() {
  const { artifacts, hydrateLoading } = useCampaignStore();
  const calendar = (artifacts as { campaign_calendar?: CalData }).campaign_calendar;

  if (hydrateLoading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-16 text-center text-sm text-slate-500">Loading calendar…</div>
    );
  }

  if (!calendar || !calendar.days) {
    return (
      <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
        <h1 className="font-display text-2xl font-bold text-slate-900">Campaign Calendar</h1>
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <CalendarDays className="mx-auto text-slate-300" size={40} />
          <p className="mt-3 text-sm text-slate-500">30-day schedule appears after campaign runs.</p>
        </div>
      </div>
    );
  }

  const summary = calendar.summary;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Campaign Calendar</h1>
        <p className="mt-1 text-sm text-slate-600">
          Deterministic 30-day schedule — {summary?.total_events || 0} events optimised for channel-specific timing windows.
        </p>
      </div>

      {/* Channel summary bar */}
      {summary?.by_channel && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(summary.by_channel).map(([ch, count]) => (
            <span key={ch} className={`rounded-full px-3 py-1 text-xs font-semibold ${CH_COLORS[ch] || "bg-slate-100 text-slate-700"}`}>
              {ch} · {count}
            </span>
          ))}
        </div>
      )}

      {/* Day grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {calendar.days.map((day) => (
          <div
            key={day.date}
            className={`rounded-2xl border bg-white p-4 shadow-sm ${
              day.events.length > 0 ? "border-slate-200" : "border-slate-100 opacity-60"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800">
                {day.weekday} · {day.date.slice(5)}
              </span>
              <span className="rounded-md bg-indigo-50 px-1.5 py-0.5 text-[9px] font-semibold text-indigo-600">
                {day.phase}
              </span>
            </div>
            {day.events.length > 0 ? (
              <div className="mt-2 space-y-1.5">
                {day.events.map((ev, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold ${CH_COLORS[ev.channel] || "bg-slate-100 text-slate-600"}`}>
                      {ev.channel}
                    </span>
                    <span className="text-[10px] text-slate-500">{ev.time} · {ev.format}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-[10px] text-slate-400">No events</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
