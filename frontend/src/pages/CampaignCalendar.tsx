import { useMemo, useState, useEffect, useRef } from "react";
import { useCampaignStore } from "../components/CampaignStore";
import { InstagramPost } from "../components/content/InstagramPost";
import { TwitterPost } from "../components/content/TwitterPost";
import { LinkedInPost } from "../components/content/LinkedInPost";
import { WhatsAppMessage } from "../components/content/WhatsAppMessage";
import { EmailPreview } from "../components/content/EmailPreview";
import { VideoConceptCard } from "../components/content/VideoConceptCard";
import { SourceFootnotes } from "../components/presentation/SourceFootnotes";
import {
  normalizePlatform,
  parseContentSchedule,
  platformSectionsFromRows,
  rowsFromArtifact,
  type ContentScheduleArtifact,
  type ScheduleRow,
} from "../lib/contentSchedule";
import { collectSources, sourceMatchers } from "../lib/traceSources";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Info,
  LayoutGrid,
  Lightbulb,
  Sparkles,
  X,
  Zap,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type CalDay = {
  date: string;
  weekday: string;
  phase: string;
  events: { channel: string; time: string; format: string; priority?: string }[];
};

type TimingReasoning = {
  method?: string;
  brand_posts_used?: number;
  competitor_posts_used?: number;
  instagram_overridden?: boolean;
  instagram_best_days?: string[];
  instagram_best_hours?: string[];
  video_overridden?: boolean;
  video_best_days?: string[];
  video_best_hours?: string[];
  details?: (string | null | undefined)[];
};

type CalData = {
  days?: CalDay[];
  summary?: {
    total_events: number;
    by_channel: Record<string, number>;
    start_date?: string;
    duration_days?: number;
    timing_reasoning?: TimingReasoning;
  };
};

// ── Channel styling ───────────────────────────────────────────────────────────

const CH_DOT: Record<string, string> = {
  instagram: "bg-pink-500",
  linkedin: "bg-blue-600",
  twitter: "bg-slate-900",
  email: "bg-amber-500",
  whatsapp: "bg-green-500",
  push_notification: "bg-orange-500",
  blog: "bg-emerald-500",
  seo: "bg-cyan-500",
  video: "bg-rose-500",
};

const CH_PILL: Record<string, string> = {
  instagram: "bg-pink-100 text-pink-800 border-pink-200",
  linkedin: "bg-blue-100 text-blue-800 border-blue-200",
  twitter: "bg-slate-800 text-white border-slate-700",
  email: "bg-amber-100 text-amber-800 border-amber-200",
  whatsapp: "bg-green-100 text-green-800 border-green-200",
  push_notification: "bg-orange-100 text-orange-800 border-orange-200",
  blog: "bg-emerald-100 text-emerald-800 border-emerald-200",
  seo: "bg-cyan-100 text-cyan-800 border-cyan-200",
  video: "bg-rose-100 text-rose-800 border-rose-200",
};

const CH_LABEL: Record<string, string> = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  twitter: "X / Twitter",
  email: "Email",
  whatsapp: "WhatsApp",
  push_notification: "Push",
  blog: "Blog",
  seo: "SEO",
  video: "Video",
};

const PHASE_COLORS: Record<string, string> = {
  Launch: "bg-indigo-100 text-indigo-700",
  Amplify: "bg-violet-100 text-violet-700",
  Sustain: "bg-teal-100 text-teal-700",
  Awareness: "bg-sky-100 text-sky-700",
  Conversion: "bg-rose-100 text-rose-700",
  Retention: "bg-amber-100 text-amber-700",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function buildGrid(year: number, month: number, calDayMap: Map<string, CalDay>) {
  // month is 1-indexed
  const firstDay = new Date(year, month - 1, 1);
  // weekday of first day (0=Sun → convert to Mon-first: 0=Mon,6=Sun)
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(isoDate(new Date(year, month - 1, d)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

// ── Platform post renderer ────────────────────────────────────────────────────

function PlatformPostsForDay({
  rows,
  brandName,
  artifacts,
}: {
  rows: ScheduleRow[];
  brandName: string;
  artifacts: Record<string, unknown>;
}) {
  const sections = useMemo(() => platformSectionsFromRows(rows), [rows]);

  const imageUrls = ((artifacts as { image_urls?: string[] }).image_urls || []).filter(Boolean);
  const videoCreatives = (artifacts as { video_concepts?: { concepts?: unknown[] } }).video_concepts;
  const videoConcepts = (videoCreatives?.concepts || []) as Record<string, unknown>[];

  if (rows.length === 0) {
    return <p className="text-sm text-slate-400 italic">No scheduled posts for this date.</p>;
  }

  return (
    <div className="space-y-10">
      {sections.map(({ platform: pid, rows: pRows }) => (
        <div key={pid}>
          <div className="mb-4 flex items-center gap-2">
            <div className={`h-2.5 w-2.5 rounded-full ${CH_DOT[pid] || "bg-slate-400"}`} />
            <h4 className="font-display text-sm font-bold text-slate-800">{CH_LABEL[pid] || pid}</h4>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
              {pRows.length}
            </span>
          </div>

          <div className={`flex flex-col gap-6 ${
            pid === "instagram" ? "sm:flex-row sm:flex-wrap" : ""
          }`}>
            {pid === "instagram" && pRows.map((row, i) => (
              <div key={row.id || i} className="w-full max-w-sm">
                <InstagramPost row={row} brandName={brandName} index={i} />
              </div>
            ))}
            {pid === "twitter" && pRows.map((row, i) => (
              <TwitterPost key={row.id || i} row={row} brandName={brandName} index={i} />
            ))}
            {pid === "linkedin" && pRows.map((row, i) => (
              <LinkedInPost key={row.id || i} row={row} brandName={brandName} index={i} />
            ))}
            {pid === "whatsapp" && pRows.map((row, i) => (
              <div key={row.id || i} className="w-full max-w-sm">
                <WhatsAppMessage row={row} brandName={brandName} index={i} />
              </div>
            ))}
            {pid === "email" && pRows.map((row, i) => (
              <EmailPreview key={row.id || i} row={row} brandName={brandName} index={i} />
            ))}
            {pid === "video" && (
              <>
                {videoConcepts.length > 0
                  ? videoConcepts.slice(0, pRows.length).map((c, i) => (
                      <VideoConceptCard key={i} concept={c} index={i} imageUrls={imageUrls} />
                    ))
                  : pRows.map((row, i) => (
                      <div key={row.id || i} className="rounded-2xl border border-rose-100 bg-rose-50/40 p-5">
                        {row.headline && <h4 className="font-bold text-slate-900">{row.headline}</h4>}
                        {row.caption && <p className="mt-2 text-sm text-slate-700">{row.caption}</p>}
                      </div>
                    ))}
              </>
            )}
            {(pid === "push_notification" || pid === "blog") && pRows.map((row, i) => (
              <div key={row.id || i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                {row.headline && <p className="font-semibold text-slate-900">{row.headline}</p>}
                {row.caption && <p className="mt-1.5 text-sm text-slate-700">{row.caption}</p>}
                {row.push_title && <p className="font-semibold text-slate-900">{row.push_title}</p>}
                {row.push_body && <p className="mt-1 text-sm text-slate-600">{row.push_body}</p>}
                {row.cta && <p className="mt-2 text-xs font-semibold text-indigo-700">CTA: {row.cta}</p>}
              </div>
            ))}
            {![
              "instagram", "linkedin", "twitter", "whatsapp", "email", "video",
              "push_notification", "blog",
            ].includes(pid) &&
              pRows.map((row, i) => (
                <div
                  key={row.id || i}
                  className="rounded-xl border border-slate-200 border-dashed bg-slate-50/80 p-4 shadow-sm"
                >
                  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    {CH_LABEL[pid] || pid}
                  </p>
                  {row.headline && <p className="mt-1 font-semibold text-slate-900">{row.headline}</p>}
                  {row.caption && <p className="mt-1.5 text-sm text-slate-700">{row.caption}</p>}
                  {row.push_title && <p className="font-semibold text-slate-900">{row.push_title}</p>}
                  {row.push_body && <p className="mt-1 text-sm text-slate-600">{row.push_body}</p>}
                  {row.cta && <p className="mt-2 text-xs font-semibold text-indigo-700">CTA: {row.cta}</p>}
                  {!row.headline && !row.caption && !row.push_title && !row.push_body && (
                    <p className="mt-1 text-sm italic text-slate-500">No copy on this row yet.</p>
                  )}
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Day detail panel ──────────────────────────────────────────────────────────

function DayPanel({
  calDay,
  scheduleRows,
  timingReasoning,
  brandName,
  artifacts,
  sources,
  onClose,
}: {
  calDay: CalDay;
  scheduleRows: ScheduleRow[];
  timingReasoning: TimingReasoning | undefined;
  brandName: string;
  artifacts: Record<string, unknown>;
  sources: { url: string; title?: string | null }[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"reasoning" | "posts">("reasoning");
  const panelRef = useRef<HTMLDivElement>(null);

  const d = parseDate(calDay.date);
  const displayDate = d.toLocaleDateString(undefined, {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
  const phaseClass = PHASE_COLORS[calDay.phase] || "bg-slate-100 text-slate-600";
  const details = (timingReasoning?.details || []).filter(Boolean) as string[];

  useEffect(() => {
    function handle(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end" style={{ backdropFilter: "blur(2px)", background: "rgba(15,23,42,0.45)" }}>
      {/* Overlay close area */}
      <button type="button" className="absolute inset-0" onClick={onClose} aria-label="Close" />

      {/* Panel */}
      <div
        ref={panelRef}
        className="relative z-10 flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl overflow-hidden animate-in slide-in-from-right duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Panel header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-white px-6 py-5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-600">Campaign Day</p>
            <h2 className="mt-0.5 font-display text-xl font-bold text-slate-900">{displayDate}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-3 py-0.5 text-[11px] font-bold ${phaseClass}`}>
                {calDay.phase}
              </span>
              <span className="rounded-full bg-slate-100 px-3 py-0.5 text-[11px] font-medium text-slate-600">
                {calDay.events.length} channel event{calDay.events.length !== 1 ? "s" : ""}
              </span>
              {scheduleRows.length > 0 && (
                <span className="rounded-full bg-indigo-50 px-3 py-0.5 text-[11px] font-medium text-indigo-700">
                  {scheduleRows.length} scheduled post{scheduleRows.length !== 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-b border-slate-200 bg-slate-50/70 px-6">
          <button
            type="button"
            onClick={() => setTab("reasoning")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-[13px] font-semibold transition ${
              tab === "reasoning"
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <Lightbulb size={14} />
            Reasoning & schedule
          </button>
          <button
            type="button"
            onClick={() => setTab("posts")}
            className={`flex items-center gap-2 border-b-2 px-4 py-3 text-[13px] font-semibold transition ${
              tab === "posts"
                ? "border-indigo-600 text-indigo-700"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            <LayoutGrid size={14} />
            Suggested posts
            {scheduleRows.length > 0 && (
              <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                {scheduleRows.length}
              </span>
            )}
          </button>
        </div>

        {/* Panel body */}
        <div className="flex-1 overflow-y-auto px-6 py-6 thin-scroll">
          {tab === "reasoning" && (
            <div className="space-y-6">
              {/* Channel events */}
              {calDay.events.length > 0 && (
                <div>
                  <p className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                    <Clock size={13} />
                    Posting windows
                  </p>
                  <div className="space-y-2">
                    {calDay.events.map((ev, i) => (
                      <div
                        key={i}
                        className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                          CH_PILL[ev.channel] || "bg-slate-50 border-slate-200 text-slate-700"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`h-2 w-2 rounded-full ${CH_DOT[ev.channel] || "bg-slate-400"}`} />
                          <span className="font-semibold capitalize">{CH_LABEL[ev.channel] || ev.channel}</span>
                          {ev.format && (
                            <span className="rounded-md bg-white/30 px-2 py-0.5 text-[10px] font-medium">
                              {ev.format}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[12px] font-semibold">{ev.time}</span>
                          {ev.priority && (
                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                              ev.priority === "high" ? "bg-rose-100 text-rose-700" :
                              ev.priority === "medium" ? "bg-amber-100 text-amber-700" :
                              "bg-slate-100 text-slate-500"
                            }`}>
                              {ev.priority}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Timing reasoning */}
              {timingReasoning && (
                <div>
                  <p className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                    <Zap size={13} className="text-amber-500" />
                    Why these windows were chosen
                  </p>

                  {/* Data sources used */}
                  <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {(timingReasoning.brand_posts_used ?? 0) > 0 && (
                      <div className="rounded-xl border border-pink-100 bg-pink-50/60 px-3 py-2 text-center">
                        <p className="text-lg font-bold text-pink-700">{timingReasoning.brand_posts_used}</p>
                        <p className="text-[10px] font-medium text-pink-600">Brand IG posts analysed</p>
                      </div>
                    )}
                    {(timingReasoning.competitor_posts_used ?? 0) > 0 && (
                      <div className="rounded-xl border border-violet-100 bg-violet-50/60 px-3 py-2 text-center">
                        <p className="text-lg font-bold text-violet-700">{timingReasoning.competitor_posts_used}</p>
                        <p className="text-[10px] font-medium text-violet-600">Competitor posts analysed</p>
                      </div>
                    )}
                    {timingReasoning.instagram_overridden && (
                      <div className="rounded-xl border border-teal-100 bg-teal-50/60 px-3 py-2 text-center">
                        <p className="text-[10px] font-bold text-teal-700">Data-driven</p>
                        <p className="text-[10px] font-medium text-teal-600">IG windows from real engagement</p>
                      </div>
                    )}
                  </div>

                  {/* Best windows */}
                  {timingReasoning.instagram_overridden && timingReasoning.instagram_best_days && (
                    <div className="mb-3 rounded-xl border border-pink-100 bg-pink-50/40 p-4">
                      <p className="text-[10px] font-bold uppercase text-pink-700">Instagram optimal windows</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {timingReasoning.instagram_best_days.map((d) => (
                          <span key={d} className="rounded-lg bg-pink-500 px-3 py-1 text-[11px] font-bold text-white">{d}</span>
                        ))}
                        {(timingReasoning.instagram_best_hours || []).map((h) => (
                          <span key={h} className="rounded-lg border border-pink-200 bg-white px-3 py-1 text-[11px] font-mono font-semibold text-pink-800">{h}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {timingReasoning.video_overridden && timingReasoning.video_best_days && (
                    <div className="mb-3 rounded-xl border border-rose-100 bg-rose-50/40 p-4">
                      <p className="text-[10px] font-bold uppercase text-rose-700">Video/YouTube optimal windows</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {timingReasoning.video_best_days.map((d) => (
                          <span key={d} className="rounded-lg bg-rose-500 px-3 py-1 text-[11px] font-bold text-white">{d}</span>
                        ))}
                        {(timingReasoning.video_best_hours || []).map((h) => (
                          <span key={h} className="rounded-lg border border-rose-200 bg-white px-3 py-1 text-[11px] font-mono font-semibold text-rose-800">{h}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Reasoning detail bullets */}
                  {details.length > 0 && (
                    <div className="space-y-2">
                      {details.map((d, i) => (
                        <div key={i} className="flex gap-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
                          <Info size={13} className="mt-0.5 shrink-0 text-slate-400" />
                          <p className="text-[12px] leading-relaxed text-slate-700">{d}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Sources */}
              {sources.length > 0 && (
                <div>
                  <p className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                    <ExternalLink size={13} />
                    Research sources used
                  </p>
                  <SourceFootnotes sources={sources} />
                </div>
              )}

              {/* "See posts" nudge */}
              {scheduleRows.length > 0 && (
                <button
                  type="button"
                  onClick={() => setTab("posts")}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-indigo-200 bg-indigo-50/60 px-4 py-4 text-[13px] font-semibold text-indigo-700 transition hover:bg-indigo-100"
                >
                  <Sparkles size={16} />
                  View {scheduleRows.length} suggested post{scheduleRows.length !== 1 ? "s" : ""} for this day →
                </button>
              )}
            </div>
          )}

          {tab === "posts" && (
            <PlatformPostsForDay
              rows={scheduleRows}
              brandName={brandName}
              artifacts={artifacts}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main calendar page ────────────────────────────────────────────────────────

export default function CampaignCalendar() {
  const { artifacts, hydrateLoading, steps } = useCampaignStore();

  const csRaw = (artifacts as { content_schedule?: unknown }).content_schedule;
  const cs: ContentScheduleArtifact | null =
    parseContentSchedule(csRaw) ??
    (csRaw !== null && typeof csRaw === "object" && !Array.isArray(csRaw) ? (csRaw as ContentScheduleArtifact) : null);
  const scheduleRows = useMemo(() => rowsFromArtifact(cs || null), [cs]);
  const calendar = (artifacts as { campaign_calendar?: CalData }).campaign_calendar;
  const summary = calendar?.summary;
  const timingReasoning = summary?.timing_reasoning;

  // Build a map of ISO date → CalDay
  const calDayMap = useMemo(() => {
    const m = new Map<string, CalDay>();
    for (const d of (calendar?.days || [])) m.set(d.date, d);
    return m;
  }, [calendar]);

  // Build a map of ISO date → ScheduleRows
  const scheduleByDate = useMemo(() => {
    const m = new Map<string, ScheduleRow[]>();
    for (const r of scheduleRows) {
      if (!r.scheduled_at) continue;
      let key: string;
      try {
        const d = new Date(r.scheduled_at);
        key = Number.isNaN(d.getTime()) ? String(r.scheduled_at).slice(0, 10) : d.toISOString().slice(0, 10);
      } catch { key = String(r.scheduled_at).slice(0, 10); }
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(r);
    }
    return m;
  }, [scheduleRows]);

  // Determine start month from calendar
  const startDate = useMemo(() => {
    if (summary?.start_date) return parseDate(summary.start_date);
    const first = calendar?.days?.[0]?.date;
    if (first) return parseDate(first);
    return new Date();
  }, [summary, calendar]);

  const [viewYear, setViewYear] = useState(startDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(startDate.getMonth() + 1); // 1-indexed
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  useEffect(() => {
    setViewYear(startDate.getFullYear());
    setViewMonth(startDate.getMonth() + 1);
  }, [startDate]);

  // Grid cells for current view month
  const gridCells = useMemo(
    () => buildGrid(viewYear, viewMonth, calDayMap),
    [viewYear, viewMonth, calDayMap]
  );

  const brandName = useMemo(() => {
    const req = (artifacts as { request?: { brand_name?: string } })?.request;
    return req?.brand_name || "Brand";
  }, [artifacts]);

  const timingSources = useMemo(
    () => collectSources(steps, (s) => sourceMatchers.timing(s) || sourceMatchers.contentSchedule(s)),
    [steps]
  );

  const today = isoDate(new Date());

  function prevMonth() {
    if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 12) { setViewYear(y => y + 1); setViewMonth(1); }
    else setViewMonth(m => m + 1);
  }

  if (hydrateLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-slate-500">Loading calendar…</p>
      </div>
    );
  }

  const hasData = calDayMap.size > 0 || scheduleRows.length > 0;

  const selectedCalDay = selectedDate ? calDayMap.get(selectedDate) : null;
  const selectedRows = selectedDate ? (scheduleByDate.get(selectedDate) || []) : [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white pb-20">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="w-full px-6 py-7 lg:px-10 xl:px-12">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-600">Campaign Calendar</p>
              <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-slate-900">
                30-day publishing schedule
              </h1>
              <p className="mt-2 max-w-xl text-sm text-slate-500">
                Click any date to see the timing reasoning, data sources, and suggested posts for that day.
              </p>
            </div>

            {/* Summary chips */}
            {summary && (
              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
                  <CalendarDays size={15} className="text-indigo-500" />
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Total events</p>
                    <p className="text-sm font-bold tabular-nums text-slate-900">{summary.total_events}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
                  <Clock size={15} className="text-teal-500" />
                  <div>
                    <p className="text-[10px] font-bold uppercase text-slate-400">Duration</p>
                    <p className="text-sm font-bold tabular-nums text-slate-900">{summary.duration_days ?? 30} days</p>
                  </div>
                </div>
                {timingReasoning?.instagram_overridden && (
                  <div className="flex items-center gap-2 rounded-xl border border-pink-200 bg-pink-50/80 px-4 py-2.5 shadow-sm">
                    <Zap size={15} className="text-pink-600" />
                    <div>
                      <p className="text-[10px] font-bold uppercase text-pink-800/80">Data-driven</p>
                      <p className="text-xs font-bold text-pink-900">IG timing</p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Channel breakdown pills */}
          {summary?.by_channel && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {Object.entries(summary.by_channel)
                .filter(([, n]) => n > 0)
                .sort(([, a], [, b]) => b - a)
                .map(([ch, n]) => (
                  <span key={ch} className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${CH_PILL[ch] || "bg-slate-100 text-slate-700 border-slate-200"}`}>
                    {CH_LABEL[ch] || ch} · {n}
                  </span>
                ))}
            </div>
          )}
        </div>
      </div>

      <div className="w-full px-6 pt-8 lg:px-10 xl:px-12">
        {!hasData ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white py-20 text-center shadow-sm">
            <CalendarDays size={48} className="text-slate-200" />
            <p className="mt-4 text-base font-semibold text-slate-500">No calendar data yet</p>
            <p className="mt-1 text-sm text-slate-400">Run a campaign to generate your 30-day schedule.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
            {/* Month navigation */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-6 py-3">
              <button type="button" onClick={prevMonth} className="rounded-xl p-2 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition">
                <ChevronLeft size={18} />
              </button>
              <h2 className="font-display text-lg font-bold text-slate-900">
                {MONTHS[viewMonth - 1]} {viewYear}
              </h2>
              <button type="button" onClick={nextMonth} className="rounded-xl p-2 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition">
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/40">
              {WEEKDAYS.map((wd) => (
                <div key={wd} className={`py-2 text-center text-[11px] font-bold uppercase tracking-widest ${
                  wd === "Sat" || wd === "Sun" ? "text-slate-300" : "text-slate-400"
                }`}>
                  {wd}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7">
              {gridCells.map((dateStr, cellIdx) => {
                if (!dateStr) {
                  return (
                    <div key={`empty-${cellIdx}`} className="min-h-[90px] border-b border-r border-slate-100 bg-slate-50/30 last:border-r-0" />
                  );
                }

                const calDay = calDayMap.get(dateStr);
                const dayRows = scheduleByDate.get(dateStr) || [];
                const isToday = dateStr === today;
                const isSelected = dateStr === selectedDate;
                const isWeekend = cellIdx % 7 >= 5;
                const dayNum = parseInt(dateStr.slice(8), 10);
                const hasEvents = (calDay?.events.length || 0) > 0 || dayRows.length > 0;
                const phaseClass = calDay ? (PHASE_COLORS[calDay.phase] || "bg-slate-100 text-slate-500") : "";

                // Unique channels for dots
                const channels = [
                  ...new Set([
                    ...(calDay?.events.map(e => e.channel) || []),
                    ...dayRows.map(r => normalizePlatform(r.platform)),
                  ])
                ].slice(0, 5);

                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                    className={`relative min-h-[90px] border-b border-r border-slate-100 p-2 text-left transition last:border-r-0 ${
                      isSelected
                        ? "bg-indigo-50 ring-2 ring-inset ring-indigo-500"
                        : hasEvents
                        ? "hover:bg-slate-50/80 cursor-pointer"
                        : "cursor-default opacity-50"
                    } ${isWeekend && !hasEvents ? "bg-slate-50/40" : ""}`}
                  >
                    {/* Date number */}
                    <div className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold ${
                      isToday
                        ? "bg-indigo-600 text-white"
                        : isSelected
                        ? "bg-indigo-100 text-indigo-800"
                        : "text-slate-700"
                    }`}>
                      {dayNum}
                    </div>

                    {/* Phase badge */}
                    {calDay?.phase && (
                      <div className={`mt-1 rounded-md px-1.5 py-0.5 text-[9px] font-bold inline-block ${phaseClass}`}>
                        {calDay.phase}
                      </div>
                    )}

                    {/* Channel dots */}
                    {channels.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-0.5">
                        {channels.map((ch) => (
                          <div
                            key={ch}
                            className={`h-2 w-2 rounded-full ${CH_DOT[ch] || "bg-slate-400"}`}
                            title={CH_LABEL[ch] || ch}
                          />
                        ))}
                        {(calDay?.events.length || 0) + dayRows.length > 5 && (
                          <span className="text-[9px] font-bold text-slate-400">
                            +{(calDay?.events.length || 0) + dayRows.length - 5}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Post count */}
                    {dayRows.length > 0 && (
                      <div className="mt-1">
                        <span className="rounded-sm bg-indigo-600/10 px-1 py-0.5 text-[9px] font-bold text-indigo-700">
                          {dayRows.length} post{dayRows.length !== 1 ? "s" : ""}
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-3">
              <div className="flex flex-wrap items-center gap-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Legend</p>
                {Object.entries(CH_DOT).slice(0, 6).map(([ch, cls]) => (
                  <div key={ch} className="flex items-center gap-1.5">
                    <div className={`h-2.5 w-2.5 rounded-full ${cls}`} />
                    <span className="text-[11px] text-slate-500">{CH_LABEL[ch] || ch}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1.5">
                  <div className="h-6 w-6 rounded-full bg-indigo-600 flex items-center justify-center text-[8px] font-bold text-white">12</div>
                  <span className="text-[11px] text-slate-500">Today</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Timing reasoning summary strip */}
        {timingReasoning && (
          <div className="mt-8 overflow-hidden rounded-2xl border border-amber-100 bg-gradient-to-r from-amber-50/80 via-white to-orange-50/40 shadow-sm">
            <div className="flex items-center gap-2 border-b border-amber-100/60 bg-white/50 px-6 py-3">
              <Zap size={16} className="text-amber-500" />
              <h2 className="font-display text-xs font-bold uppercase tracking-widest text-amber-800">
                How posting windows were determined
              </h2>
            </div>
            <div className="px-6 py-5 space-y-3">
              <div className="flex flex-wrap gap-3">
                {(timingReasoning.brand_posts_used ?? 0) > 0 && (
                  <div className="rounded-xl border border-pink-100 bg-pink-50/60 px-4 py-2">
                    <p className="text-lg font-bold text-pink-700">{timingReasoning.brand_posts_used}</p>
                    <p className="text-[11px] text-pink-600">Brand Instagram posts analysed</p>
                  </div>
                )}
                {(timingReasoning.competitor_posts_used ?? 0) > 0 && (
                  <div className="rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-2">
                    <p className="text-lg font-bold text-violet-700">{timingReasoning.competitor_posts_used}</p>
                    <p className="text-[11px] text-violet-600">Competitor posts analysed</p>
                  </div>
                )}
              </div>
              {(timingReasoning.details || []).filter(Boolean).map((d, i) => (
                <div key={i} className="flex gap-2 rounded-xl border border-amber-100/80 bg-white/70 px-4 py-3">
                  <Info size={13} className="mt-0.5 shrink-0 text-amber-400" />
                  <p className="text-[12px] leading-relaxed text-slate-700">{d}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sources */}
        {timingSources.length > 0 && (
          <div className="mt-6">
            <SourceFootnotes sources={timingSources} />
          </div>
        )}
      </div>

      {/* ── Day detail panel ─────────────────────────────────────────────────── */}
      {selectedDate && (
        <DayPanel
          calDay={selectedCalDay || {
            date: selectedDate,
            weekday: parseDate(selectedDate).toLocaleDateString(undefined, { weekday: "long" }),
            phase: "—",
            events: [],
          }}
          scheduleRows={selectedRows}
          timingReasoning={timingReasoning}
          brandName={brandName}
          artifacts={artifacts as Record<string, unknown>}
          sources={timingSources}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
}
