import { useCampaignStore } from "../components/CampaignStore";
import { InsightSection } from "../components/presentation/InsightSection";
import { StructuredData } from "../components/presentation/StructuredData";
import { TrendingUp, Globe, MessageSquare } from "lucide-react";
import { collectSources, sourceMatchers } from "../lib/traceSources";

export default function MarketInsights() {
  const { partial, artifacts, hydrateLoading, steps } = useCampaignStore();
  const a = artifacts as Record<string, unknown>;

  const positioning = (a.positioning ?? (partial.strategy as Record<string, unknown> | undefined)?.positioning) as Record<string, unknown> | undefined;
  const channelStrategy = a.channel_strategy as Record<string, unknown> | undefined;
  const audienceMsg = a.audience_and_messaging as Record<string, unknown> | undefined;

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

  if (hydrateLoading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-16 text-center text-sm text-slate-500">Loading saved intelligence…</div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Market Insights</h1>
        <p className="mt-1 text-sm text-slate-600">
          Strategy, channels, and segments from your latest campaign — with trace-linked sources.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <InsightSection title="Positioning & channel strategy" icon={TrendingUp} sources={srcStrategy}>
          {hasStrategyBlock ? (
            <div className="space-y-6">
              {positioning && Object.keys(positioning).length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Positioning</p>
                  <StructuredData value={positioning} />
                </div>
              )}
              {channelStrategy && Object.keys(channelStrategy).length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Channel strategy</p>
                  <StructuredData value={channelStrategy} />
                </div>
              )}
              {audienceMsg && Object.keys(audienceMsg).length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">Audience & messaging</p>
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

        <InsightSection title="Social content & hooks" icon={Globe} sources={srcSocial}>
          {socialContent && Object.keys(socialContent).length > 0 ? (
            <StructuredData value={socialContent} />
          ) : researchSocial?.summary ? (
            <p className="text-sm leading-relaxed text-slate-700">{researchSocial.summary}</p>
          ) : (
            <p className="text-sm text-slate-500">Social outputs appear after the creative agents run.</p>
          )}
        </InsightSection>

        <InsightSection title="Audience segments" icon={MessageSquare} sources={srcAudience}>
          {audience && Object.keys(audience).length > 0 ? (
            Array.isArray((audience as { segments?: unknown[] }).segments) ? (
              <div className="space-y-3">
                {(audience as { segments: { name: string; description: string; preferred_channels?: string[] }[] }).segments.map(
                  (seg, i) => (
                    <div key={i} className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-white p-4 shadow-sm">
                      <p className="font-semibold text-slate-900">{seg.name}</p>
                      <p className="mt-1 text-sm text-slate-600">{seg.description}</p>
                      {seg.preferred_channels && seg.preferred_channels.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {seg.preferred_channels.map((ch: string) => (
                            <span
                              key={ch}
                              className="rounded-full bg-white px-2.5 py-0.5 text-[10px] font-semibold text-indigo-700 shadow-sm"
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
            <p className="text-sm text-slate-500">Segments are produced by the audience agent in the graph.</p>
          )}
        </InsightSection>
      </div>
    </div>
  );
}
