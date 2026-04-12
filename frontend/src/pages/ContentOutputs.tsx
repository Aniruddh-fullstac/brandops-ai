import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCampaignStore } from "../components/CampaignStore";
import { ScheduleItemCard } from "../components/content/ScheduleItemCard";
import { ChannelContent } from "../components/presentation/ChannelContent";
import { CreativeDraftDiff } from "../components/presentation/CreativeDraftDiff";
import { CritiquePanel } from "../components/presentation/CritiquePanel";
import { MemoryResolutionPanel } from "../components/presentation/MemoryResolutionPanel";
import { SourceFootnotes } from "../components/presentation/SourceFootnotes";
import { StructuredData } from "../components/presentation/StructuredData";
import {
  PLATFORM_LABEL,
  PLATFORM_ORDER,
  calendarSectionsFromRows,
  filterRows,
  normalizePlatform,
  platformSectionsFromRows,
  rowsFromArtifact,
  type ContentScheduleArtifact,
} from "../lib/contentSchedule";
import { collectSources, sourceMatchers } from "../lib/traceSources";
import { Calendar, CalendarDays, Layers, LayoutGrid, Palette, Sparkles, TrendingUp } from "lucide-react";

export default function ContentOutputs() {
  const { artifacts, hydrateLoading, steps } = useCampaignStore();
  const [platform, setPlatform] = useState<string>("all");
  const [scheduleView, setScheduleView] = useState<"platform" | "calendar">("platform");

  const cs = (artifacts as { content_schedule?: ContentScheduleArtifact }).content_schedule;
  const rows = useMemo(() => rowsFromArtifact(cs || null), [cs]);
  const filtered = useMemo(() => filterRows(rows, platform), [rows, platform]);
  const scheduleSections = useMemo(() => platformSectionsFromRows(filtered), [filtered]);
  const calendarSections = useMemo(() => calendarSectionsFromRows(filtered), [filtered]);

  const imageUrls = ((artifacts as { image_urls?: string[] }).image_urls || []).filter(Boolean);
  const critique = (artifacts as { creative_critique?: Record<string, unknown> }).creative_critique;
  const critiquePost = (artifacts as { creative_critique_post_refine?: Record<string, unknown> }).creative_critique_post_refine;
  const originalCreatives = (artifacts as { original_creatives?: Record<string, unknown> }).original_creatives || {};
  const refinedCreatives = (artifacts as { refined_creatives?: Record<string, unknown> }).refined_creatives || {};
  const hadRefinement = Object.keys(refinedCreatives).length > 0;
  const memoryRes = (artifacts as { memory_resolution?: Record<string, unknown> }).memory_resolution;
  const deliveredSeo = (artifacts as Record<string, unknown>).seo;
  const deliveredSocial = (artifacts as Record<string, unknown>).social;
  const seoWebsiteOpt = (artifacts as { seo_website_optimization?: Record<string, unknown> }).seo_website_optimization;

  const platformsPresent = useMemo(() => {
    const s = new Set<string>();
    for (const r of rows) s.add(normalizePlatform(r.platform));
    return Array.from(s).sort((a, b) => {
      const ia = PLATFORM_ORDER.indexOf(a as (typeof PLATFORM_ORDER)[number]);
      const ib = PLATFORM_ORDER.indexOf(b as (typeof PLATFORM_ORDER)[number]);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
  }, [rows]);

  const segmentTagged = useMemo(() => rows.filter((r) => r.target_segment && String(r.target_segment).trim()).length, [rows]);

  const tabSources = useMemo(() => {
    return collectSources(steps, (s) => sourceMatchers.creatives(s) || sourceMatchers.critic(s));
  }, [steps]);

  if (hydrateLoading) {
    return (
      <div className="w-full px-6 py-16 text-center text-sm text-slate-500 lg:px-10 xl:px-12">Loading saved content…</div>
    );
  }

  const hasUnified = rows.length > 0;
  const overview = cs?.overview;
  const showInitialQa = Boolean(critique && Object.keys(critique).length > 0);
  const showPostQa = Boolean(critiquePost && Object.keys(critiquePost).length > 0);
  const bothQaPanels = showInitialQa && showPostQa;
  const pageGutter = "w-full px-6 lg:px-10 xl:px-12";
  const showSeoWebsite =
    seoWebsiteOpt &&
    typeof seoWebsiteOpt === "object" &&
    Object.keys(seoWebsiteOpt).length > 0 &&
    !seoWebsiteOpt.error;

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-50/80 to-white pb-16">
      <div className="border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className={`${pageGutter} py-8`}>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-600">Content Studio</p>
              <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-slate-900">Campaign delivery</h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
                Timeline, segment-tagged posts, QA scores, memory reconciliation, and draft diffs — organized for quick review.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {hasUnified && (
                <>
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
                    <Calendar size={16} className="text-indigo-500" />
                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-400">Scheduled</p>
                      <p className="text-sm font-bold tabular-nums text-slate-900">{rows.length}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
                    <LayoutGrid size={16} className="text-teal-600" />
                    <div>
                      <p className="text-[10px] font-bold uppercase text-slate-400">Platforms</p>
                      <p className="text-sm font-bold tabular-nums text-slate-900">{platformsPresent.length}</p>
                    </div>
                  </div>
                </>
              )}
              {segmentTagged > 0 && (
                <div className="flex items-center gap-2 rounded-xl border border-fuchsia-200 bg-fuchsia-50/80 px-4 py-2.5 shadow-sm">
                  <Sparkles size={16} className="text-fuchsia-600" />
                  <div>
                    <p className="text-[10px] font-bold uppercase text-fuchsia-800/80">Segment posts</p>
                    <p className="text-sm font-bold tabular-nums text-fuchsia-900">{segmentTagged}</p>
                  </div>
                </div>
              )}
              {hadRefinement && (
                <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-2.5 shadow-sm">
                  <Palette size={16} className="text-amber-700" />
                  <div>
                    <p className="text-[10px] font-bold uppercase text-amber-900/80">Refined</p>
                    <p className="text-sm font-bold text-amber-950">Critic loop</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className={`${pageGutter} space-y-10 pt-10`}>
        {hasUnified && overview && (
          <div className="overflow-hidden rounded-2xl border border-indigo-100/90 bg-gradient-to-br from-indigo-50/90 via-white to-violet-50/40 shadow-md shadow-indigo-100/30">
            <div className="flex items-center gap-2 border-b border-indigo-100/60 bg-white/50 px-6 py-3 backdrop-blur-sm">
              <Layers size={18} className="text-indigo-600" />
              <h2 className="font-display text-xs font-bold uppercase tracking-widest text-indigo-800">Executive rhythm</h2>
            </div>
            <p className="px-6 py-5 text-sm leading-relaxed text-slate-800">{overview}</p>
          </div>
        )}

        {memoryRes && Object.keys(memoryRes).length > 0 && <MemoryResolutionPanel data={memoryRes} />}

        {showSeoWebsite && (
          <section className="overflow-hidden rounded-2xl border border-lime-200/90 bg-white shadow-md">
            <div className="flex items-center gap-2 border-b border-lime-100/90 bg-lime-50/50 px-6 py-3 backdrop-blur-sm">
              <TrendingUp size={18} className="text-lime-700" />
              <div>
                <h2 className="font-display text-xs font-bold uppercase tracking-widest text-lime-900">Website SEO</h2>
                <p className="text-[11px] text-lime-800/80">Live web research + your site context — prioritized actions with reasoning</p>
              </div>
            </div>
            <div className="space-y-4 px-6 py-5">
              {typeof seoWebsiteOpt.executive_summary === "string" && seoWebsiteOpt.executive_summary.trim() && (
                <p className="text-sm leading-relaxed text-slate-800">{seoWebsiteOpt.executive_summary}</p>
              )}
              <div className="max-h-[min(480px,55vh)] overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/40 p-4 thin-scroll">
                <StructuredData value={seoWebsiteOpt} />
              </div>
            </div>
          </section>
        )}

        {hasUnified && (
          <section>
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900">Unified schedule</h2>
                <p className="text-xs text-slate-500">
                  By platform or by calendar date — filter chips narrow the list. Open the full calendar for a month view.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to="/calendar"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/80 px-3 py-2 text-xs font-semibold text-indigo-800 shadow-sm transition hover:bg-indigo-100"
                >
                  <CalendarDays size={14} className="text-indigo-600" />
                  Calendar
                </Link>
                <div className="flex rounded-xl border border-slate-200 bg-slate-50/80 p-0.5 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setScheduleView("platform")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      scheduleView === "platform" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    By platform
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleView("calendar")}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      scheduleView === "calendar" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    By date
                  </button>
                </div>
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-md">
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 bg-slate-50/50 px-4 py-3">
                <LayoutGrid size={16} className="text-slate-400" />
                <span className="text-xs font-semibold text-slate-600">Platform</span>
              </div>
              <div className="flex flex-wrap gap-2 p-4">
                <button
                  type="button"
                  onClick={() => setPlatform("all")}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    platform === "all" ? "bg-indigo-600 text-white shadow-md" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  All ({rows.length})
                </button>
                {platformsPresent.map((pid) => (
                  <button
                    key={pid}
                    type="button"
                    onClick={() => setPlatform(pid)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      platform === pid ? "bg-indigo-600 text-white shadow-md" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {PLATFORM_LABEL[pid] || pid} ({filterRows(rows, pid).length})
                  </button>
                ))}
              </div>

              <div className="space-y-10 border-t border-slate-100 p-4">
                {scheduleView === "platform" ? (
                  scheduleSections.length === 0 ? (
                    <p className="text-center text-sm text-slate-500">No items for this filter.</p>
                  ) : (
                    scheduleSections.map(({ platform: sectionPid, rows: sectionRows }) => {
                      const badgePid = sectionPid;
                      const sectionLabel = PLATFORM_LABEL[badgePid] || badgePid.replace(/_/g, " ");
                      return (
                        <section key={sectionPid} className="space-y-3">
                          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-2">
                            <h3 className="font-display text-sm font-bold text-slate-800">{sectionLabel}</h3>
                            <span className="text-[11px] font-medium text-slate-500">{sectionRows.length} scheduled</span>
                          </div>
                          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                            {sectionRows.map((row, i) => (
                              <ScheduleItemCard key={row.id || `${row.scheduled_at}-${sectionPid}-${i}`} row={row} />
                            ))}
                          </div>
                        </section>
                      );
                    })
                  )
                ) : calendarSections.length === 0 ? (
                  <p className="text-center text-sm text-slate-500">No items for this filter.</p>
                ) : (
                  calendarSections.map(({ date, platformSections: dayPlatformSections }) => (
                    <section key={date} className="space-y-6">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100/80 bg-indigo-50/40 px-3 py-2 rounded-t-lg">
                        <h3 className="font-display text-sm font-bold text-indigo-950">
                          {date === "— Undated" ? date : new Date(date + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                        </h3>
                        <span className="text-[11px] font-medium text-indigo-800/80">
                          {dayPlatformSections.reduce((n, s) => n + s.rows.length, 0)} posts
                        </span>
                      </div>
                      <div className="space-y-8 pl-1">
                        {dayPlatformSections.map(({ platform: sectionPid, rows: sectionRows }) => {
                          const sectionLabel = PLATFORM_LABEL[sectionPid] || sectionPid.replace(/_/g, " ");
                          return (
                            <div key={`${date}-${sectionPid}`} className="space-y-3">
                              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-100 pb-2">
                                <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">{sectionLabel}</h4>
                                <span className="text-[11px] font-medium text-slate-500">{sectionRows.length} scheduled</span>
                              </div>
                              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                                {sectionRows.map((row, i) => (
                                  <ScheduleItemCard key={row.id || `${date}-${row.scheduled_at}-${sectionPid}-${i}`} row={row} />
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  ))
                )}
              </div>
              <div className="border-t border-slate-100 px-4 py-3 bg-slate-50/30">
                <SourceFootnotes sources={tabSources} />
              </div>
            </div>
          </section>
        )}

        {!hasUnified && (
          <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-r from-amber-50 to-orange-50/50 p-5 shadow-sm">
            <p className="text-sm font-semibold text-amber-950">Unified schedule not found for this run.</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-900/90">
              Run a new campaign for the cross-platform timeline. Raw channel bundles below are still available.
            </p>
          </div>
        )}

        <details className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm open:shadow-md">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 transition hover:bg-slate-50">
            <div>
              <h2 className="font-display text-sm font-bold text-slate-900">Channel bundles (reference)</h2>
              <p className="text-xs text-slate-500">SEO, social, video, WhatsApp — expand only when you need the full JSON-shaped output.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500 group-open:bg-indigo-100 group-open:text-indigo-700">
              Toggle
            </span>
          </summary>
          <div className="space-y-6 border-t border-slate-100 p-5">
            {(["seo", "social", "video_concepts", "messaging_whatsapp"] as const).map((key) => {
              const data = (artifacts as Record<string, unknown>)[key];
              if (!data || typeof data !== "object") return null;
              return (
                <div key={key}>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">{key.replace(/_/g, " ")}</p>
                  <ChannelContent data={data} />
                </div>
              );
            })}
          </div>
        </details>

        {imageUrls.length > 0 && (
          <section>
            <h2 className="font-display text-lg font-bold text-slate-900">Campaign visuals</h2>
            <p className="mt-1 text-xs text-slate-500">Key art aligned to strategy — pair with posts marked for imagery.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {imageUrls.map((u, i) => (
                <div key={u + i} className="group relative overflow-hidden rounded-2xl border border-slate-200 shadow-md">
                  <img src={u} alt={`Campaign visual ${i + 1}`} className="aspect-[4/3] w-full object-cover transition group-hover:scale-[1.02]" />
                  <a
                    href={u}
                    download
                    className="absolute bottom-2 right-2 rounded-lg bg-white/95 px-2.5 py-1 text-[10px] font-bold text-indigo-700 opacity-0 shadow-lg backdrop-blur transition group-hover:opacity-100"
                  >
                    Download
                  </a>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <SourceFootnotes sources={collectSources(steps, (s) => sourceMatchers.visuals(s))} />
            </div>
          </section>
        )}

        {hadRefinement && (
          <CreativeDraftDiff
            originalCreatives={originalCreatives}
            refinedCreatives={refinedCreatives}
            deliveredSeo={deliveredSeo}
            deliveredSocial={deliveredSocial}
          />
        )}

        {showInitialQa || showPostQa ? (
          <div className={`grid w-full gap-6 ${bothQaPanels ? "xl:grid-cols-2" : "grid-cols-1"}`}>
            {showInitialQa && (
              <div className="min-w-0 rounded-2xl border border-slate-200/90 bg-white p-6 shadow-md xl:p-8">
                <h2 className="font-display text-base font-bold text-slate-900">Creative QA — initial draft</h2>
                <p className="mt-1 text-xs text-slate-500">Scores and directives on the first creative bundle.</p>
                <div className="mt-5">
                  <CritiquePanel critique={critique} />
                </div>
                <div className="mt-5 border-t border-slate-100 pt-4">
                  <SourceFootnotes sources={collectSources(steps, (s) => sourceMatchers.critic(s))} />
                </div>
              </div>
            )}
            {showPostQa && (
              <div className="min-w-0 rounded-2xl border border-teal-200/60 bg-gradient-to-br from-teal-50/30 to-white p-6 shadow-md xl:p-8">
                <h2 className="font-display text-base font-bold text-slate-900">Creative QA — after refinement</h2>
                <p className="mt-1 text-xs text-slate-600">Validates the bundle that moved forward to localization.</p>
                <div className="mt-5">
                  <CritiquePanel critique={critiquePost} />
                </div>
                <div className="mt-5 border-t border-teal-100 pt-4">
                  <SourceFootnotes sources={collectSources(steps, (s) => sourceMatchers.criticRecheck(s))} />
                </div>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
