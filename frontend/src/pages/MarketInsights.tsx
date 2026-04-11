import { useCampaignStore } from "../components/CampaignStore";
import { TrendingUp, Globe, MessageSquare } from "lucide-react";

function Card({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <Icon size={18} className="text-indigo-600" />
        <h3 className="font-display text-base font-semibold text-slate-900">{title}</h3>
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

/** Prefer persisted `artifacts` (Firestore); fall back to live stream `partial` during a run. */
export default function MarketInsights() {
  const { partial, artifacts, hydrateLoading, steps } = useCampaignStore();
  const a = artifacts as Record<string, unknown>;

  const trendsBundle = {
    positioning: a.positioning ?? (partial.strategy as Record<string, unknown> | undefined)?.positioning,
    channel_strategy: a.channel_strategy,
    audience_and_messaging: a.audience_and_messaging,
  };
  const hasTrends = Object.values(trendsBundle).some((v) => v != null && (typeof v !== "object" || Object.keys(v as object).length > 0));

  const socialContent = (a.social ?? partial.social) as Record<string, unknown> | undefined;
  const researchSocial = steps.find((s) => s.agent === "social_media_intelligence" || /social/i.test(s.title));

  const audience = (a.audience_segments ?? partial.audience_segments) as Record<string, unknown> | undefined;

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
          Strategy, channels, and segments from your latest completed campaign (saved to your account).
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Trends & strategy context" icon={TrendingUp}>
          {hasTrends ? (
            <pre className="max-h-[350px] overflow-auto rounded-xl bg-slate-50 p-4 text-xs text-slate-700">
              {JSON.stringify(trendsBundle, null, 2)}
            </pre>
          ) : researchSocial?.structured || researchSocial?.summary ? (
            <div className="space-y-2 text-sm text-slate-700">
              {researchSocial.summary && <p>{researchSocial.summary}</p>}
              {researchSocial.structured && (
                <pre className="max-h-[280px] overflow-auto rounded-xl bg-slate-50 p-3 text-xs">
                  {JSON.stringify(researchSocial.structured, null, 2)}
                </pre>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Run a campaign to populate insights. Data loads automatically after completion.</p>
          )}
        </Card>

        <Card title="Social & messaging" icon={Globe}>
          {socialContent && Object.keys(socialContent).length > 0 ? (
            <pre className="max-h-[350px] overflow-auto rounded-xl bg-slate-50 p-4 text-xs text-slate-700">
              {JSON.stringify(socialContent, null, 2)}
            </pre>
          ) : researchSocial ? (
            <p className="text-sm text-slate-600">{researchSocial.summary || "See agent trace for social research detail."}</p>
          ) : (
            <p className="text-sm text-slate-500">Social outputs appear here from saved campaign artifacts.</p>
          )}
        </Card>

        <Card title="Audience Segments" icon={MessageSquare}>
          {audience && Object.keys(audience).length > 0 ? (
            <div className="space-y-3">
              {Array.isArray((audience as { segments?: unknown[] }).segments) ? (
                (audience as { segments: { name: string; description: string; preferred_channels?: string[] }[] }).segments.map(
                  (seg, i) => (
                    <div key={i} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                      <p className="font-semibold text-slate-900">{seg.name}</p>
                      <p className="mt-1 text-sm text-slate-600">{seg.description}</p>
                      {seg.preferred_channels && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {seg.preferred_channels.map((ch: string) => (
                            <span
                              key={ch}
                              className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700"
                            >
                              {ch}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                )
              ) : (
                <pre className="overflow-auto rounded-xl bg-slate-50 p-4 text-xs text-slate-700">
                  {JSON.stringify(audience, null, 2)}
                </pre>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Segments are generated in the campaign graph and stored with your run.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
