import { useCampaignStore } from "../components/CampaignStore";
import { InsightSection } from "../components/presentation/InsightSection";
import { InsightFlow } from "../components/presentation/InsightFlow";
import { MemoryResolutionPanel } from "../components/presentation/MemoryResolutionPanel";
import { SourceFootnotes } from "../components/presentation/SourceFootnotes";
import { StructuredData } from "../components/presentation/StructuredData";
import { TrendingUp, Globe, MessageSquare, Sparkles } from "lucide-react";
import { collectSources, sourceMatchers } from "../lib/traceSources";
import {
  buildDidLines,
  extractSocialInsight,
  extractStrategyInsight,
  formatSourcesLine,
  truncate,
} from "../lib/marketInsightUtils";
import type { TraceStep } from "../types";

function CollectedLine({
  label,
  sources,
}: {
  label: string;
  sources: { url: string; title?: string | null }[];
}) {
  const { count, hostSample } = formatSourcesLine(sources);
  if (count === 0) {
    return <span>{label} — citations will appear after agents finish citing URLs.</span>;
  }
  return (
    <span>
      <strong className="font-semibold text-slate-800">{count}</strong> cited source{count !== 1 ? "s" : ""} for{" "}
      {label}.{" "}
      {hostSample.length > 0 && (
        <span className="text-slate-500">Examples: {hostSample.join(" · ")}</span>
      )}
    </span>
  );
}

function OutcomeBullets({ headline, bullets }: { headline: string; bullets: string[] }) {
  return (
    <div>
      {headline && <p className="font-medium text-slate-900">{headline}</p>}
      {bullets.length > 0 && (
        <ul className="mt-2 list-inside list-disc space-y-1.5 text-sm text-slate-700">
          {bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RawDetailsToggle({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null) return null;
  const empty =
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value as object).length === 0;
  if (empty) return null;
  return (
    <details className="mt-4 rounded-lg border border-slate-100 bg-slate-50/50 text-left">
      <summary className="cursor-pointer px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500 hover:text-indigo-600">
        {label}
      </summary>
      <div className="max-h-[min(320px,50vh)] overflow-y-auto border-t border-slate-100 p-3 thin-scroll">
        <StructuredData value={value} />
      </div>
    </details>
  );
}

export default function MarketInsights() {
  const { partial, artifacts, hydrateLoading, steps } = useCampaignStore();
  const a = artifacts as Record<string, unknown>;

  const positioning = (a.positioning ?? (partial.strategy as Record<string, unknown> | undefined)?.positioning) as
    | Record<string, unknown>
    | undefined;
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

  const strategyStep = steps.find((s) => s.phase === "strategy") as TraceStep | undefined;

  const didStrategy = buildDidLines(
    steps,
    (s) => s.phase === "strategy" || s.phase === "brand_fetch" || s.phase === "ingest",
    6
  );
  const didSocial = buildDidLines(
    steps,
    (s) => sourceMatchers.researchSocial(s) || s.phase === "creative" || /creative/i.test(s.agent),
    6
  );
  const didAudience = buildDidLines(steps, (s) => sourceMatchers.audience(s), 6);

  const strategyInsight = extractStrategyInsight(positioning, audienceMsg, channelStrategy, strategyStep);
  const socialInsight = extractSocialInsight(socialContent);

  const allSourceCount = new Set(steps.flatMap((s) => (s.sources || []).map((x) => x.url).filter(Boolean))).size;
  const snapshotCitations = collectSources(steps, () => true).slice(0, 12);

  const runOverview = buildDidLines(
    steps,
    () => true,
    8
  );

  if (hydrateLoading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-16 text-center text-sm text-slate-500">Loading saved intelligence…</div>
    );
  }

  const hasAnyCampaign = steps.length > 0 || Object.keys(a).length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50/90 to-white pb-16">
      <div className="border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-6 py-10">
          <p className="text-[11px] font-bold uppercase tracking-widest text-violet-600">Market intelligence</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-slate-900">Outcomes, not data dumps</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
            Each block shows what ran, what evidence we collected, and the insight you can use — with raw detail tucked
            away if you need it.
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-10 px-6 pt-10">
        {hasAnyCampaign && (
          <div className="rounded-2xl border border-violet-200/60 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-2 text-violet-700">
              <Sparkles size={18} />
              <span className="text-[11px] font-bold uppercase tracking-widest">Campaign snapshot</span>
            </div>
            <div className="mt-4 grid gap-6 md:grid-cols-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">What we ran</p>
                <ul className="mt-2 space-y-1 text-xs text-slate-600">
                  {runOverview.length > 0 ? (
                    runOverview.map((line, i) => (
                      <li key={i} className="leading-snug">
                        · {line}
                      </li>
                    ))
                  ) : (
                    <li className="text-slate-400">Run a campaign to see steps.</li>
                  )}
                </ul>
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">What we gathered</p>
                <p className="mt-2 text-sm text-slate-700">
                  <strong>{allSourceCount}</strong> unique URL{allSourceCount !== 1 ? "s" : ""} cited across research &
                  strategy traces{steps.length > 0 ? ` · ${steps.length} agent step${steps.length !== 1 ? "s" : ""}` : ""}.
                </p>
              </div>
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-700">Insight outcome</p>
                {executiveSummary ? (
                  <p className="mt-2 text-sm font-medium leading-relaxed text-slate-900">{truncate(executiveSummary, 520)}</p>
                ) : strategyInsight.headline ? (
                  <p className="mt-2 text-sm font-medium leading-relaxed text-slate-900">{strategyInsight.headline}</p>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">Complete a run to see the executive takeaway here.</p>
                )}
                {snapshotCitations.length > 0 && (
                  <SourceFootnotes sources={snapshotCitations} variant="inline" className="!mt-3 border-t border-indigo-200/50 !pt-3" />
                )}
              </div>
            </div>
          </div>
        )}

        {memoryRes && Object.keys(memoryRes).length > 0 && <MemoryResolutionPanel data={memoryRes} />}

        <div className="grid gap-6 lg:grid-cols-2">
          <InsightSection
            title="Positioning & channels"
            subtitle="Strategy synthesis from brief, site, and research — then how you show up."
            icon={TrendingUp}
            accent="indigo"
          >
            <InsightFlow
              whatWeDid={didStrategy}
              collected={<CollectedLine label="this section" sources={srcStrategy} />}
              citationSources={srcStrategy}
              outcome={
                hasStrategyBlock || strategyStep ? (
                  <OutcomeBullets headline={strategyInsight.headline} bullets={strategyInsight.bullets} />
                ) : researchSocial?.summary ? (
                  <p className="text-sm text-slate-700">{truncate(researchSocial.summary, 400)}</p>
                ) : (
                  <p className="text-sm text-slate-500">Run a campaign to populate strategy insights.</p>
                )
              }
            />
            {hasStrategyBlock && (
              <>
                <RawDetailsToggle label="Full positioning & channel data" value={positioning} />
                <RawDetailsToggle label="Channel plan & measurement" value={channelStrategy} />
                <RawDetailsToggle label="Audience & pillars" value={audienceMsg} />
              </>
            )}
            {strategyStep?.structured && (
              <RawDetailsToggle label="Strategy agent JSON (full)" value={strategyStep.structured} />
            )}
          </InsightSection>

          <InsightSection
            title="Social & hooks"
            subtitle="Ideas your creative agents produced — not every row of copy."
            icon={Globe}
            accent="teal"
          >
            <InsightFlow
              whatWeDid={didSocial}
              collected={<CollectedLine label="social / creative work" sources={srcSocial} />}
              citationSources={srcSocial}
              outcome={
                socialContent && Object.keys(socialContent).length > 0 ? (
                  <OutcomeBullets headline={socialInsight.headline} bullets={socialInsight.bullets} />
                ) : researchSocial?.summary ? (
                  <p className="text-sm text-slate-700">{truncate(researchSocial.summary, 400)}</p>
                ) : (
                  <p className="text-sm text-slate-500">Social outputs appear after creatives run.</p>
                )
              }
            />
            <RawDetailsToggle label="Full social JSON" value={socialContent} />
          </InsightSection>
        </div>

        <InsightSection
          title="Audience segments"
          subtitle="Who you’re speaking to and how to open the conversation."
          icon={MessageSquare}
          accent="violet"
        >
          <InsightFlow
            whatWeDid={didAudience}
            collected={<CollectedLine label="segmentation & strategy" sources={srcAudience} />}
            citationSources={srcAudience}
            methodologyNote="Segments are one LLM synthesis pass, but the model is now fed Reddit posts, social/trends research excerpts, competitive JSON, and (when present) Instagram comment themes — not the brief alone. Still not statistical clustering; it is evidence-informed messaging personas."
            outcome={
              audience && Object.keys(audience).length > 0 ? (
                Array.isArray((audience as { segments?: unknown[] }).segments) ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(audience as { segments: { name: string; description: string; sample_hook?: string }[] }).segments.map(
                      (seg, i) => (
                        <div
                          key={i}
                          className="rounded-xl border border-violet-100 bg-white/80 p-4 shadow-sm"
                        >
                          <p className="text-sm font-bold text-slate-900">{seg.name}</p>
                          <p className="mt-1.5 text-xs leading-relaxed text-slate-600 line-clamp-4">{seg.description}</p>
                          {seg.sample_hook && (
                            <p className="mt-2 border-l-2 border-violet-300 pl-2 text-[11px] italic text-violet-900">
                              Hook: “{truncate(seg.sample_hook, 140)}”
                            </p>
                          )}
                        </div>
                      )
                    )}
                  </div>
                ) : (
                  <OutcomeBullets headline="Segmentation output" bullets={[]} />
                )
              ) : (
                <p className="text-sm text-slate-500">Segments are generated in the graph after strategy.</p>
              )
            }
          />
          <RawDetailsToggle label="Full audience_segments JSON" value={audience} />
        </InsightSection>
      </div>
    </div>
  );
}
