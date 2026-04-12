import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCampaignStore } from "../components/CampaignStore";
import { InstagramPost } from "../components/content/InstagramPost";
import { TwitterPost } from "../components/content/TwitterPost";
import { LinkedInPost } from "../components/content/LinkedInPost";
import { WhatsAppMessage } from "../components/content/WhatsAppMessage";
import { EmailPreview } from "../components/content/EmailPreview";
import { VideoConceptCard } from "../components/content/VideoConceptCard";
import { CritiquePanel } from "../components/presentation/CritiquePanel";
import { KeywordGraphPanel } from "../components/presentation/KeywordGraphPanel";
import { MemoryResolutionPanel } from "../components/presentation/MemoryResolutionPanel";
import { SourceFootnotes } from "../components/presentation/SourceFootnotes";
import { StructuredData } from "../components/presentation/StructuredData";
import {
  campaignVisualForRow,
  filterRows,
  normalizePlatform,
  parseContentSchedule,
  rowsFromArtifact,
  rowsFromCreativesFallback,
  type ContentScheduleArtifact,
  type ScheduleRow,
} from "../lib/contentSchedule";
import { collectSources, sourceMatchers } from "../lib/traceSources";
import {
  Bell,
  CalendarDays,
  Clapperboard,
  Instagram,
  Layers,
  LayoutGrid,
  Linkedin,
  Mail,
  MessageCircle,
  Sparkles,
  TrendingUp,
  Twitter,
  Waypoints,
} from "lucide-react";

// ── Platform tab config ────────────────────────────────────────────────────────

type PlatformTab = {
  id: string;
  label: string;
  icon: React.ReactNode;
  gradient: string;
  border: string;
  activeBg: string;
  activeText: string;
  ringColor: string;
};

const TABS: PlatformTab[] = [
  {
    id: "instagram",
    label: "Instagram",
    icon: <Instagram size={16} />,
    gradient: "from-pink-500 via-red-500 to-yellow-500",
    border: "border-pink-200",
    activeBg: "bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500",
    activeText: "text-white",
    ringColor: "ring-pink-400",
  },
  {
    id: "twitter",
    label: "X / Twitter",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
    gradient: "from-slate-800 to-slate-900",
    border: "border-slate-300",
    activeBg: "bg-slate-900",
    activeText: "text-white",
    ringColor: "ring-slate-500",
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    icon: <Linkedin size={16} />,
    gradient: "from-blue-600 to-blue-700",
    border: "border-blue-200",
    activeBg: "bg-blue-700",
    activeText: "text-white",
    ringColor: "ring-blue-500",
  },
  {
    id: "video",
    label: "Video",
    icon: <Clapperboard size={16} />,
    gradient: "from-rose-500 to-orange-500",
    border: "border-rose-200",
    activeBg: "bg-gradient-to-r from-rose-500 to-orange-500",
    activeText: "text-white",
    ringColor: "ring-rose-400",
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    ),
    gradient: "from-green-500 to-emerald-600",
    border: "border-green-200",
    activeBg: "bg-gradient-to-r from-green-500 to-emerald-600",
    activeText: "text-white",
    ringColor: "ring-green-400",
  },
  {
    id: "email",
    label: "Email",
    icon: <Mail size={16} />,
    gradient: "from-amber-500 to-orange-500",
    border: "border-amber-200",
    activeBg: "bg-gradient-to-r from-amber-500 to-orange-500",
    activeText: "text-white",
    ringColor: "ring-amber-400",
  },
];

// ── Brand context helper ───────────────────────────────────────────────────────

function useBrandContext(artifacts: Record<string, unknown> | undefined | null) {
  return useMemo(() => {
    const req = (artifacts as { request?: { brand_name?: string; instagram_handle?: string } })?.request;
    const brandName =
      req?.brand_name ||
      (artifacts as { executive_summary?: string })?.executive_summary?.split(" ")[0] ||
      "Brand";
    const handle = req?.instagram_handle || "";
    const igFollowers = (artifacts as { brand_instagram_analysis?: { profile?: { followers?: number } } })
      ?.brand_instagram_analysis?.profile?.followers;
    return { brandName, handle, igFollowers };
  }, [artifacts]);
}

// ── Platform section renderer ──────────────────────────────────────────────────

function PlatformSection({
  tab,
  rows,
  allScheduleRows,
  artifacts,
  brandName,
  brandHandle,
  igFollowers,
}: {
  tab: PlatformTab;
  rows: ScheduleRow[];
  /** Full merged timeline (used to align campaign `image_urls` with the correct post). */
  allScheduleRows: ScheduleRow[];
  artifacts: Record<string, unknown>;
  brandName: string;
  brandHandle: string;
  igFollowers?: number;
}) {
  const imageUrls = ((artifacts as { image_urls?: string[] }).image_urls || []).filter(Boolean);

  if (tab.id === "instagram") {
    return (
      <div>
        <SectionHeader
          title="Instagram posts"
          subtitle={`${rows.length} scheduled posts · carousels, reels, stories`}
          count={rows.length}
          tab={tab}
        />
        {rows.length === 0 ? (
          <EmptyState label="No Instagram posts scheduled." />
        ) : (
          <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((row, i) => (
              <InstagramPost
                key={row.id || i}
                row={row}
                brandName={brandName}
                brandHandle={brandHandle}
                index={i}
                campaignImageFallback={campaignVisualForRow(row, i, imageUrls, allScheduleRows)}
              />
            ))}
          </div>
        )}
        {imageUrls.length > 0 && (
          <div className="mt-10">
            <h3 className="mb-3 text-sm font-bold text-slate-700">Campaign visuals</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {imageUrls.map((u, i) => (
                <div key={u + i} className="group relative overflow-hidden rounded-2xl border border-slate-200 shadow-md">
                  <img src={u} alt="" className="aspect-square w-full object-cover transition group-hover:scale-[1.02]" />
                  <a href={u} download className="absolute bottom-2 right-2 rounded-lg bg-white/95 px-2.5 py-1 text-[10px] font-bold text-indigo-700 opacity-0 shadow-lg backdrop-blur transition group-hover:opacity-100">
                    Download
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (tab.id === "twitter") {
    return (
      <div>
        <SectionHeader title="X / Twitter posts" subtitle={`${rows.length} tweets · threads & single posts`} count={rows.length} tab={tab} />
        {rows.length === 0 ? <EmptyState label="No tweets scheduled." /> : (
          <div className="flex flex-col gap-6 max-w-2xl">
            {rows.map((row, i) => (
              <TwitterPost
                key={row.id || i}
                row={row}
                brandName={brandName}
                brandHandle={brandHandle}
                index={i}
                campaignImageFallback={campaignVisualForRow(row, i, imageUrls, allScheduleRows)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (tab.id === "linkedin") {
    return (
      <div>
        <SectionHeader title="LinkedIn posts" subtitle={`${rows.length} posts · thought leadership & brand content`} count={rows.length} tab={tab} />
        {rows.length === 0 ? <EmptyState label="No LinkedIn posts scheduled." /> : (
          <div className="flex flex-col gap-6 max-w-2xl">
            {rows.map((row, i) => (
              <LinkedInPost
                key={row.id || i}
                row={row}
                brandName={brandName}
                index={i}
                followers={igFollowers}
                campaignImageFallback={campaignVisualForRow(row, i, imageUrls, allScheduleRows)}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (tab.id === "video") {
    const videoCreatives = (artifacts as { video_concepts?: { concepts?: unknown[] } }).video_concepts;
    const concepts = videoCreatives?.concepts || [];
    const scheduleVideoRows = rows; // video rows from schedule

    return (
      <div className="space-y-10">
        {/* Concept cards */}
        <div>
          <SectionHeader
            title="Video concepts & scripts"
            subtitle={`${concepts.length} concepts with full scripts, storyboards, visual direction`}
            count={concepts.length}
            tab={tab}
          />
          {concepts.length === 0 && scheduleVideoRows.length === 0 ? (
            <EmptyState label="No video concepts generated." />
          ) : (
            <div className="space-y-4">
              {(concepts as Record<string, unknown>[]).map((c, i) => (
                <VideoConceptCard key={i} concept={c} index={i} imageUrls={imageUrls} />
              ))}
              {/* Video schedule rows */}
              {scheduleVideoRows.length > 0 && (
                <div className="mt-6">
                  <h3 className="mb-3 text-sm font-bold text-slate-700">Scheduled video posts</h3>
                  <div className="space-y-4">
                    {scheduleVideoRows.map((row, i) => (
                      <VideoConceptCard key={row.id || i} concept={row as unknown as Record<string, unknown>} index={concepts.length + i} imageUrls={imageUrls} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Campaign visuals */}
        {imageUrls.length > 0 && (
          <div>
            <h3 className="mb-3 text-sm font-bold text-slate-700">Generated campaign visuals</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {imageUrls.map((u, i) => (
                <div key={u + i} className="group relative overflow-hidden rounded-2xl border border-slate-200 shadow-md">
                  <img src={u} alt="" className="aspect-video w-full object-cover transition group-hover:scale-[1.02]" />
                  <a href={u} download className="absolute bottom-2 right-2 rounded-lg bg-white/95 px-2.5 py-1 text-[10px] font-bold text-indigo-700 opacity-0 shadow-lg backdrop-blur transition group-hover:opacity-100">
                    Download
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (tab.id === "whatsapp") {
    return (
      <div>
        <SectionHeader
          title="WhatsApp marketing messages"
          subtitle={`${rows.length} messages · broadcast, location-targeted, CTA buttons`}
          count={rows.length}
          tab={tab}
        />
        {rows.length === 0 ? <EmptyState label="No WhatsApp messages scheduled." /> : (
          <div className="grid gap-8 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((row, i) => (
              <WhatsAppMessage key={row.id || i} row={row} brandName={brandName} index={i} />
            ))}
          </div>
        )}
      </div>
    );
  }

  if (tab.id === "email") {
    return (
      <div>
        <SectionHeader
          title="Email campaigns"
          subtitle={`${rows.length} emails · subject lines, preheaders, hidden tracking pixel, geo-targeted send time`}
          count={rows.length}
          tab={tab}
        />
        {rows.length === 0 ? <EmptyState label="No emails scheduled." /> : (
          <div className="space-y-8">
            {rows.map((row, i) => (
              <EmailPreview key={row.id || i} row={row} brandName={brandName} brandHandle={brandHandle} index={i} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return null;
}

function SectionHeader({ title, subtitle, count, tab }: { title: string; subtitle: string; count: number; tab: PlatformTab }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="flex items-center gap-2">
          <div className={`flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br ${tab.gradient} text-white shadow-sm`}>
            {tab.icon}
          </div>
          <h2 className="font-display text-xl font-bold text-slate-900">{title}</h2>
        </div>
        <p className="mt-1 text-[13px] text-slate-500">{subtitle}</p>
      </div>
      <div className={`rounded-full border px-3 py-1 text-[11px] font-bold ${tab.border} bg-white text-slate-700`}>
        {count} {count === 1 ? "item" : "items"}
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-6 py-12 text-center">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-xs text-slate-400">Run a campaign to generate content for this platform.</p>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ContentOutputs() {
  const { artifacts, hydrateLoading, steps } = useCampaignStore();
  const [activeTab, setActiveTab] = useState<string>("instagram");

  const csRaw = (artifacts as { content_schedule?: unknown }).content_schedule;
  const cs: ContentScheduleArtifact | null =
    parseContentSchedule(csRaw) ??
    (csRaw !== null && typeof csRaw === "object" && !Array.isArray(csRaw) ? (csRaw as ContentScheduleArtifact) : null);
  const originalCreatives = (artifacts as { original_creatives?: Record<string, unknown> }).original_creatives || {};
  const refinedCreatives = (artifacts as { refined_creatives?: Record<string, unknown> }).refined_creatives || {};
  const baseCreatives = (artifacts as { creatives?: Record<string, unknown> }).creatives || {};

  const creativeBundleForFallback = useMemo(() => {
    if (refinedCreatives && Object.keys(refinedCreatives).length > 0) return refinedCreatives;
    if (baseCreatives && Object.keys(baseCreatives).length > 0) return baseCreatives;
    if (originalCreatives && Object.keys(originalCreatives).length > 0) return originalCreatives;
    return {};
  }, [refinedCreatives, baseCreatives, originalCreatives]);

  const rows = useMemo(() => {
    const fromSchedule = rowsFromArtifact(cs || null);
    if (fromSchedule.length > 0) return fromSchedule;
    return rowsFromCreativesFallback(creativeBundleForFallback);
  }, [cs, creativeBundleForFallback]);
  const imageUrls = ((artifacts as { image_urls?: string[] }).image_urls || []).filter(Boolean);
  const critique = (artifacts as { creative_critique?: Record<string, unknown> }).creative_critique;
  const critiquePost = (artifacts as { creative_critique_post_refine?: Record<string, unknown> }).creative_critique_post_refine;
  const memoryRes = (artifacts as { memory_resolution?: Record<string, unknown> }).memory_resolution;
  const seoWebsiteOpt = (artifacts as { seo_website_optimization?: Record<string, unknown> }).seo_website_optimization;

  const { brandName, handle, igFollowers } = useBrandContext(artifacts as Record<string, unknown>);

  const tabSources = useMemo(
    () =>
      collectSources(
        steps,
        (s) =>
          sourceMatchers.creatives(s) ||
          sourceMatchers.criticRecheck(s) ||
          sourceMatchers.critic(s),
      ),
    [steps],
  );
  const refinedQaAvailable = Boolean(critiquePost && Object.keys(critiquePost).length > 0);
  const fallbackQaOnly = Boolean(!refinedQaAvailable && critique && Object.keys(critique).length > 0);
  const displayCritique = refinedQaAvailable ? critiquePost : critique;
  const qaSources = useMemo(
    () =>
      collectSources(
        steps,
        refinedQaAvailable ? sourceMatchers.criticRecheck : sourceMatchers.critic,
      ),
    [steps, refinedQaAvailable],
  );
  const kwGraphSources = useMemo(
    () => collectSources(steps, (s) => sourceMatchers.keywordGraph(s)),
    [steps]
  );
  // Per-tab row counts for badges
  const tabCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const tab of TABS) {
      if (tab.id === "video") {
        const concepts = (artifacts as { video_concepts?: { concepts?: unknown[] } })?.video_concepts?.concepts || [];
        m[tab.id] = concepts.length + filterRows(rows, "video").length;
      } else {
        m[tab.id] = filterRows(rows, tab.id).length;
      }
    }
    return m;
  }, [rows, artifacts]);

  const activeTabRows = useMemo(() => filterRows(rows, activeTab), [rows, activeTab]);
  const activeTabObj = TABS.find((t) => t.id === activeTab)!;

  if (hydrateLoading) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center">
        <p className="text-sm text-slate-500">Loading content studio…</p>
      </div>
    );
  }

  const showSeoWebsite =
    seoWebsiteOpt && typeof seoWebsiteOpt === "object" && Object.keys(seoWebsiteOpt).length > 0 && !(seoWebsiteOpt as { error?: unknown }).error;
  const deliveredSeo = (artifacts as Record<string, unknown>).seo;
  const deliveredSocial = (artifacts as Record<string, unknown>).social;

  const kgraph = (artifacts as {
    keyword_graph?: {
      top_keywords?: { keyword: string; score: number }[];
      clusters?: { id: number; keywords: string[] }[];
      edges?: { source: string; target: string; weight?: number }[];
      total_nodes?: number;
      total_edges?: number;
    };
  }).keyword_graph;
  const showKeywordGraph =
    Boolean(kgraph?.top_keywords?.length) ||
    Boolean(kgraph?.edges?.length) ||
    (kgraph?.total_nodes ?? 0) > 0;

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-slate-50 to-white pb-20">

      {/* ── Hero header ──────────────────────────────────────────────────────── */}
      <div className="border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="w-full px-6 py-8 lg:px-10 xl:px-12">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-600">Content Studio</p>
              <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-slate-900">
                {brandName} · Campaign Delivery
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-500">
                Platform-native previews for every channel — Instagram, X, LinkedIn, Video, WhatsApp, Email.
                Each post rendered in its actual UI with real engagement patterns.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <StatChip icon={<LayoutGrid size={14} className="text-indigo-500" />} label="Total posts" value={rows.length} />
              {imageUrls.length > 0 && <StatChip icon={<Sparkles size={14} className="text-violet-500" />} label="Visuals" value={imageUrls.length} />}
              <Link
                to="/calendar"
                className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50/80 px-4 py-2.5 text-xs font-semibold text-indigo-800 shadow-sm hover:bg-indigo-100"
              >
                <CalendarDays size={14} className="text-indigo-600" />
                Calendar view
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full px-6 lg:px-10 xl:px-12">

        {/* ── Overview / executive rhythm ──────────────────────────────────────── */}
        {cs?.overview && (
          <div className="mt-8 overflow-hidden rounded-2xl border border-indigo-100/90 bg-gradient-to-br from-indigo-50/90 via-white to-violet-50/40 shadow-md">
            <div className="flex items-center gap-2 border-b border-indigo-100/60 bg-white/50 px-6 py-3">
              <Layers size={18} className="text-indigo-600" />
              <h2 className="font-display text-xs font-bold uppercase tracking-widest text-indigo-800">Campaign rhythm</h2>
            </div>
            <p className="px-6 py-5 text-sm leading-relaxed text-slate-800">{cs.overview}</p>
          </div>
        )}

        {/* ── Memory resolution ──────────────────────────────────────────────── */}
        {memoryRes && Object.keys(memoryRes).length > 0 && (
          <div className="mt-8"><MemoryResolutionPanel data={memoryRes} /></div>
        )}

        {/* ── Keyword graph (same engine as Performance — feeds copy & SEO) ─── */}
        {showKeywordGraph && kgraph && (
          <section className="mt-8 overflow-hidden rounded-2xl border border-indigo-200/90 bg-white shadow-md">
            <div className="flex items-center gap-2 border-b border-indigo-100/90 bg-indigo-50/50 px-6 py-3">
              <Waypoints size={18} className="text-indigo-600" />
              <div>
                <h2 className="font-display text-xs font-bold uppercase tracking-widest text-indigo-900">Keyword graph</h2>
                <p className="text-[11px] text-indigo-800/80">PageRank-ranked terms from co-occurrence — aligns hooks and SEO with demand</p>
              </div>
            </div>
            <div className="space-y-4 px-6 py-5">
              <KeywordGraphPanel
                top_keywords={kgraph.top_keywords}
                clusters={kgraph.clusters}
                edges={kgraph.edges}
                total_nodes={kgraph.total_nodes}
                total_edges={kgraph.total_edges}
              />
              <div className="border-t border-slate-100 pt-4">
                <SourceFootnotes sources={kwGraphSources} />
              </div>
            </div>
          </section>
        )}

        {/* ── SEO website section ───────────────────────────────────────────── */}
        {showSeoWebsite && (
          <section className="mt-8 overflow-hidden rounded-2xl border border-lime-200/90 bg-white shadow-md">
            <div className="flex items-center gap-2 border-b border-lime-100/90 bg-lime-50/50 px-6 py-3">
              <TrendingUp size={18} className="text-lime-700" />
              <div>
                <h2 className="font-display text-xs font-bold uppercase tracking-widest text-lime-900">Website SEO</h2>
                <p className="text-[11px] text-lime-800/80">Live research + your site context — prioritized actions with reasoning</p>
              </div>
            </div>
            <div className="space-y-4 px-6 py-5">
              {typeof (seoWebsiteOpt as { executive_summary?: string }).executive_summary === "string" && (
                <p className="text-sm leading-relaxed text-slate-800">{(seoWebsiteOpt as { executive_summary?: string }).executive_summary}</p>
              )}
              <div className="max-h-[480px] overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/40 p-4 thin-scroll">
                <StructuredData value={seoWebsiteOpt} />
              </div>
            </div>
          </section>
        )}

        {/* ── Platform tabs ──────────────────────────────────────────────────── */}
        <div className="mt-10">
          {/* Tab bar */}
          <div className="overflow-x-auto">
            <div className="flex min-w-max gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-1.5 shadow-sm">
              {TABS.map((tab) => {
                const count = tabCounts[tab.id] || 0;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13px] font-semibold transition-all ${
                      isActive
                        ? `${tab.activeBg} ${tab.activeText} shadow-lg ring-2 ring-offset-1 ${tab.ringColor}`
                        : "text-slate-600 hover:bg-white hover:text-slate-900 hover:shadow-sm"
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                    {count > 0 && (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                          isActive ? "bg-white/25 text-white" : "bg-slate-200 text-slate-600"
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tab content */}
          <div className="mt-8">
            <PlatformSection
              tab={activeTabObj}
              rows={activeTabRows}
              allScheduleRows={rows}
              artifacts={artifacts as Record<string, unknown>}
              brandName={brandName}
              brandHandle={handle}
              igFollowers={igFollowers}
            />
          </div>
        </div>

        {/* ── Push notifications (not in main tabs — small utility section) ─── */}
        {filterRows(rows, "push_notification").length > 0 && (
          <section className="mt-12">
            <div className="mb-4 flex items-center gap-2">
              <Bell size={16} className="text-orange-500" />
              <h2 className="font-display text-lg font-bold text-slate-900">Push notifications</h2>
              <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-800">
                {filterRows(rows, "push_notification").length}
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filterRows(rows, "push_notification").map((row, i) => (
                <div key={row.id || i} className="overflow-hidden rounded-2xl border border-orange-100 bg-white shadow-md">
                  {/* iOS-style notification */}
                  <div className="flex items-start gap-3 bg-slate-800/95 px-4 py-3">
                    <div className="h-8 w-8 shrink-0 rounded-xl bg-indigo-600 flex items-center justify-center text-xs font-bold text-white">
                      {brandName?.[0]}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between">
                        <p className="text-[12px] font-semibold text-white">{brandName}</p>
                        <p className="text-[10px] text-white/50">now</p>
                      </div>
                      {row.push_title && <p className="text-[12px] font-semibold text-white">{row.push_title}</p>}
                      {row.push_body && <p className="text-[11px] text-white/80 mt-0.5">{row.push_body}</p>}
                    </div>
                  </div>
                  {row.cta && (
                    <div className="border-t border-slate-700/50 bg-slate-800/90 px-4 py-2 text-center">
                      <p className="text-[12px] font-semibold text-blue-400">{row.cta}</p>
                    </div>
                  )}
                  {row.target_segment && (
                    <div className="bg-orange-50 px-3 py-1.5">
                      <p className="text-[10px] text-orange-700">Segment: {row.target_segment}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── Blog posts ────────────────────────────────────────────────────── */}
        {filterRows(rows, "blog").length > 0 && (
          <section className="mt-12">
            <div className="mb-4 flex items-center gap-2">
              <MessageCircle size={16} className="text-emerald-600" />
              <h2 className="font-display text-lg font-bold text-slate-900">Blog / SEO posts</h2>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                {filterRows(rows, "blog").length}
              </span>
            </div>
            <div className="space-y-4">
              {filterRows(rows, "blog").map((row, i) => (
                <article key={row.id || i} className="overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-md">
                  <div className="border-b border-emerald-50 bg-emerald-50/50 px-6 py-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Blog Article</span>
                      {row.scheduled_at && (
                        <span className="text-[11px] text-slate-500">
                          {new Date(row.scheduled_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="px-6 py-5">
                    {row.headline && <h3 className="text-lg font-bold text-slate-900">{row.headline}</h3>}
                    {row.caption && <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{row.caption}</p>}
                    {Array.isArray(row.hashtags) && row.hashtags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {row.hashtags.map(t => (
                          <span key={t} className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700">
                            {t.startsWith("#") ? t : `#${t}`}
                          </span>
                        ))}
                      </div>
                    )}
                    {row.cta && <p className="mt-3 text-sm font-semibold text-emerald-700">CTA: {row.cta}</p>}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        {/* ── QA panels ─────────────────────────────────────────────────────── */}
        {(refinedQaAvailable || fallbackQaOnly) && displayCritique && (
          <div className="mt-12">
            <div className="rounded-2xl border border-teal-200/60 bg-gradient-to-br from-teal-50/30 to-white p-6 shadow-md">
              <h2 className="font-display text-base font-bold text-slate-900">Creative QA</h2>
              <p className="mt-1 text-xs text-slate-500">
                {refinedQaAvailable
                  ? "Quality review for the delivered creative bundle (post-refinement)."
                  : "Quality review for the generated creative bundle."}
              </p>
              <div className="mt-5">
                <CritiquePanel critique={displayCritique as Record<string, unknown>} />
              </div>
              <div className="mt-5 border-t border-teal-100 pt-4">
                <SourceFootnotes sources={qaSources} />
              </div>
            </div>
          </div>
        )}

        {/* ── Source footnotes ──────────────────────────────────────────────── */}
        <div className="mt-12 border-t border-slate-100 pt-6">
          <SourceFootnotes sources={tabSources} />
        </div>
      </div>
    </div>
  );
}

function StatChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
      {icon}
      <div>
        <p className="text-[10px] font-bold uppercase text-slate-400">{label}</p>
        <p className="text-sm font-bold tabular-nums text-slate-900">{value}</p>
      </div>
    </div>
  );
}
