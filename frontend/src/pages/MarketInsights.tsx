import { useCampaignStore } from "../components/CampaignStore";
import { InsightSection } from "../components/presentation/InsightSection";
import { MemoryResolutionPanel } from "../components/presentation/MemoryResolutionPanel";
import { StructuredData } from "../components/presentation/StructuredData";
import { TrendingUp, Globe, MessageSquare, Quote, Lightbulb } from "lucide-react";
import { collectSources, sourceMatchers } from "../lib/traceSources";

export default function MarketInsights() {
  const { partial, artifacts, hydrateLoading, steps } = useCampaignStore();
  const a = artifacts as Record<string, unknown>;

  const positioning = (a.positioning ?? (partial.strategy as Record<string, unknown> | undefined)?.positioning) as Record<string, unknown> | undefined;
  const channelStrategy = a.channel_strategy as Record<string, unknown> | undefined;
  const audienceMsg = a.audience_and_messaging as Record<string, unknown> | undefined;
  const executiveSummary = typeof a.executive_summary === "string" ? a.executive_summary : "";
  const memoryRes = a.memory_resolution as Record<string, unknown> | undefined;

  const hasStrategyBlock =
    [positioning, channelStrategy, audienceMsg].some(
      (v) => v && typeof v === "object" && Object.keys(v).length > 0
    );

  const socialContent = (a.social ?? partial.social) as Record<string, unknown> | undefined;
  const researchSocial = steps.find((s) => s.agent === "social_media_intelligence" || /social/i.test(s.title));

  const audience = (a.audience_segments ?? partial.audience_segments) as Record<string, unknown> | undefined;

  const srcStrategy = collectSources(steps, (s) => sourceMatchers.strategy(s) || sourceMatchers.brandFetch(s));
  const srcSocial = collectSources(steps, (s) => sourceMatchers.researchSocial(s) || sourceMatchers.creatives(s));
  const srcAudience = collectSources(steps, (s) => sourceMatchers.audience(s) || sourceMatchers.strategy(s));

  const oneLiner =
    typeof positioning?.value_prop === "string"
      ? positioning.value_prop
      : typeof positioning?.statement === "string"
        ? positioning.statement
        : typeof positioning?.headline === "string"
          ? positioning.headline
          : "";

  if (hydrateLoading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-16 text-center text-sm text-slate-500">Loading saved intelligence…</div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50/90 to-white pb-16">
      <div className="border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <p className="text-[11px] font-bold uppercase tracking-widest text-violet-600">Market intelligence</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-slate-900">Strategy & segments</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Positioning, channels, creative hooks, and micro-audiences — laid out for scanning, not scrolling walls of text.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-10 px-6 pt-10">
        {(executiveSummary || oneLiner) && (
          <div className="grid gap-4 lg:grid-cols-3">
            {executiveSummary && (
              <div className="lg:col-span-2 overflow-hidden rounded-2xl border border-violet-200/70 bg-gradient-to-br from-violet-50/80 via-white to-indigo-50/40 p-6 shadow-md">
                <div className="flex items-center gap-2 text-violet-700">
                  <Quote size={18} />
                  <span className="text-[11px] font-bold uppercase tracking-widest">Executive summary</span>
                </div>
                <p className="mt-4 text-sm font-medium leading-relaxed text-slate-800">{executiveSummary}</p>
              </div>
            )}
            {oneLiner && (
              <div className="flex flex-col justify-center rounded-2xl border border-indigo-100 bg-white p-6 shadow-md">
                <div className="flex items-center gap-2 text-indigo-600">
                  <Lightbulb size={18} />
                  <span className="text-[11px] font-bold uppercase tracking-widest">Positioning hook</span>
                </div>
                <p className="mt-3 text-sm font-semibold leading-snug text-slate-900">{oneLiner}</p>
              </div>
            )}
          </div>
        )}

        {memoryRes && Object.keys(memoryRes).length > 0 && <MemoryResolutionPanel data={memoryRes} />}

        <div className="grid gap-6 lg:grid-cols-2">
          <InsightSection
            title="Positioning & channel strategy"
            subtitle="How you show up, where you win, and how channels ladder to the goal."
            icon={TrendingUp}
            sources={srcStrategy}
            accent="indigo"
          >
            {hasStrategyBlock ? (
              <div className="space-y-8">
                {positioning && Object.keys(positioning).length > 0 && (
                  <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
                    <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">Positioning</p>
                    <StructuredData value={positioning} />
                  </div>
                )}
                {channelStrategy && Object.keys(channelStrategy).length > 0 && (
                  <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
                    <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">Channel strategy</p>
                    <StructuredData value={channelStrategy} />
                  </div>
                )}
                {audienceMsg && Object.keys(audienceMsg).length > 0 && (
                  <div className="rounded-xl border border-slate-100 bg-slate-50/40 p-4">
                    <p className="mb-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">Audience & messaging</p>
                    <StructuredData value={audienceMsg} />
                  </div>
                )}
              </div>
            ) : researchSocial?.summary || researchSocial?.structured ? (
              <div className="space-y-3 text-sm text-slate-700">
                {researchSocial.summary && <p className="leading-relaxed">{researchSocial.summary}</p>}
                {researchSocial.structured && typeof researchSocial.structured === "object" && (
                  <div className="rounded-xl border border-slate-100 bg-slate-50/80 p-4">
                    <StructuredData value={researchSocial.structured} />
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Run a campaign to populate insights.</p>
            )}
          </InsightSection>

          <InsightSection
            title="Social content & hooks"
            subtitle="Channel-native ideas your creative agents produced — ready to steal from."
            icon={Globe}
            sources={srcSocial}
            accent="teal"
          >
            {socialContent && Object.keys(socialContent).length > 0 ? (
              <div className="rounded-xl border border-slate-100 bg-slate-50/30 p-1">
                <StructuredData value={socialContent} />
              </div>
            ) : researchSocial?.summary ? (
              <p className="text-sm leading-relaxed text-slate-700">{researchSocial.summary}</p>
            ) : (
              <p className="text-sm text-slate-500">Social outputs appear after the creative agents run.</p>
            )}
          </InsightSection>
        </div>

        <InsightSection
          title="Audience segments"
          subtitle="2–3 micro-audiences with hooks and channel fit — used downstream in tailored variants."
          icon={MessageSquare}
          sources={srcAudience}
          accent="violet"
        >
          {audience && Object.keys(audience).length > 0 ? (
            Array.isArray((audience as { segments?: unknown[] }).segments) ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {(audience as { segments: { name: string; description: string; preferred_channels?: string[]; sample_hook?: string }[] }).segments.map(
                  (seg, i) => (
                    <div
                      key={i}
                      className="flex flex-col rounded-2xl border border-indigo-100/90 bg-gradient-to-br from-indigo-50/70 to-white p-5 shadow-sm transition hover:shadow-md"
                    >
                      <p className="font-display text-sm font-bold text-slate-900">{seg.name}</p>
                      <p className="mt-2 flex-1 text-xs leading-relaxed text-slate-600">{seg.description}</p>
                      {seg.sample_hook && (
                        <p className="mt-3 rounded-lg border border-indigo-100/80 bg-white/80 px-3 py-2 text-[11px] italic leading-relaxed text-indigo-900">
                          “{seg.sample_hook}”
                        </p>
                      )}
                      {seg.preferred_channels && seg.preferred_channels.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-1.5">
                          {seg.preferred_channels.map((ch: string) => (
                            <span
                              key={ch}
                              className="rounded-full bg-white px-2.5 py-0.5 text-[10px] font-semibold text-indigo-700 shadow-sm ring-1 ring-indigo-100"
                            >
                              {ch}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            ) : (
              <StructuredData value={audience} />
            )
          ) : (
            <p className="text-sm text-slate-500">Segments are produced early in the graph, before creatives.</p>
          )}
        </InsightSection>
      </div>
    </div>
  );
}
