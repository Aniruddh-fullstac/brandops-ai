import { useState } from "react";
import { useCampaignStore } from "../components/CampaignStore";
import { SourceFootnotes } from "../components/presentation/SourceFootnotes";
import { StructuredData } from "../components/presentation/StructuredData";
import { collectSources, sourceMatchers } from "../lib/traceSources";
import {
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  ExternalLink,
  Eye,
  LayoutGrid,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Swords,
  Table2,
  Target,
} from "lucide-react";

/* ── Helpers ── */

function asStringList(v: unknown): string[] {
  if (v == null) return [];
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string") {
    const parts = v.split(/\n|•|;/).map((s) => s.trim()).filter(Boolean);
    return parts.length ? parts : [v];
  }
  return [String(v)];
}

type Competitor = {
  name: string;
  positioning: string;
  differentiators?: unknown;
  evidence_urls?: string[];
  threat_level?: string;
};

const THREAT_CONFIG: Record<string, { bg: string; text: string; border: string; icon: typeof Shield; label: string }> = {
  high:   { bg: "bg-rose-50",  text: "text-rose-700",  border: "border-rose-200",  icon: ShieldAlert, label: "High Threat" },
  medium: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", icon: Shield,      label: "Medium Threat" },
  low:    { bg: "bg-teal-50",  text: "text-teal-700",  border: "border-teal-200",  icon: ShieldCheck, label: "Low Threat" },
};

function getThreat(level?: string) {
  const key = (level || "").toLowerCase();
  return THREAT_CONFIG[key] || THREAT_CONFIG.medium;
}

/* ── Competitor Card (grid view) ── */
function CompetitorCard({ comp, index, onSelect }: { comp: Competitor; index: number; onSelect: () => void }) {
  const diffs = asStringList(comp.differentiators);
  const threat = getThreat(comp.threat_level);
  const ThreatIcon = threat.icon;

  return (
    <button
      onClick={onSelect}
      className={`anim-fade-up group flex flex-col rounded-2xl border bg-white p-5 text-left shadow-sm transition-all hover:shadow-lg hover:border-indigo-200 active:scale-[0.99] ${threat.border}`}
      style={{ animationDelay: `${index * 0.06}s` }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${threat.bg}`}>
            <Swords size={16} className={threat.text} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">{comp.name}</h3>
            <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase ${threat.bg} ${threat.text}`}>
              <ThreatIcon size={9} />
              {threat.label}
            </span>
          </div>
        </div>
        <Eye size={14} className="flex-shrink-0 text-slate-300 group-hover:text-indigo-400 transition-colors mt-1" />
      </div>

      {/* Positioning */}
      <p className="mt-3 text-xs leading-relaxed text-slate-600 line-clamp-3">{comp.positioning}</p>

      {/* Differentiators preview */}
      {diffs.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {diffs.slice(0, 2).map((d, j) => (
            <span key={j} className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 line-clamp-1">
              {d}
            </span>
          ))}
          {diffs.length > 2 && (
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] text-slate-400">+{diffs.length - 2}</span>
          )}
        </div>
      )}

      {/* Evidence links count */}
      {comp.evidence_urls && comp.evidence_urls.length > 0 && (
        <p className="mt-auto pt-3 flex items-center gap-1 text-[10px] text-slate-400">
          <ExternalLink size={9} />
          {comp.evidence_urls.length} source{comp.evidence_urls.length > 1 ? "s" : ""}
        </p>
      )}
    </button>
  );
}

/* ── Competitor detail drawer ── */
function CompetitorDetail({ comp, onClose }: { comp: Competitor; onClose: () => void }) {
  const diffs = asStringList(comp.differentiators);
  const threat = getThreat(comp.threat_level);
  const ThreatIcon = threat.icon;

  return (
    <div className="anim-fade-up space-y-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${threat.bg}`}>
            <Swords size={20} className={threat.text} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">{comp.name}</h2>
            <span className={`inline-flex items-center gap-1 mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${threat.bg} ${threat.text}`}>
              <ThreatIcon size={10} />
              {threat.label}
            </span>
          </div>
        </div>
        <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 transition-colors">
          Close
        </button>
      </div>

      {/* Positioning */}
      <div>
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1.5">Market Positioning</h4>
        <p className="text-sm leading-relaxed text-slate-700">{comp.positioning}</p>
      </div>

      {/* Differentiators */}
      {diffs.length > 0 && (
        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Key Differentiators</h4>
          <div className="space-y-1.5">
            {diffs.map((d, j) => (
              <div key={j} className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2">
                <ArrowRight size={11} className="mt-0.5 flex-shrink-0 text-indigo-400" />
                <p className="text-xs text-slate-700">{d}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Evidence URLs */}
      {comp.evidence_urls && comp.evidence_urls.length > 0 && (
        <div>
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">Evidence Sources</h4>
          <div className="space-y-1">
            {comp.evidence_urls.map((url, j) => (
              <a key={j} href={url} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs text-indigo-600 hover:underline">
                <ExternalLink size={10} className="flex-shrink-0" />
                <span className="truncate">{(() => { try { return new URL(url).hostname; } catch { return url; } })()}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Threat distribution bar ── */
function ThreatOverview({ competitors }: { competitors: Competitor[] }) {
  const counts = { high: 0, medium: 0, low: 0 };
  for (const c of competitors) {
    const key = (c.threat_level || "medium").toLowerCase() as keyof typeof counts;
    if (key in counts) counts[key]++;
  }
  const total = competitors.length;

  return (
    <div className="anim-fade-up flex items-center gap-4 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="text-xs font-semibold text-slate-500">Threat Distribution</div>
      <div className="flex flex-1 items-center gap-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
        {counts.high > 0 && (
          <div className="h-full rounded-full bg-rose-400 transition-all" style={{ width: `${(counts.high / total) * 100}%` }} />
        )}
        {counts.medium > 0 && (
          <div className="h-full rounded-full bg-amber-400 transition-all" style={{ width: `${(counts.medium / total) * 100}%` }} />
        )}
        {counts.low > 0 && (
          <div className="h-full rounded-full bg-teal-400 transition-all" style={{ width: `${(counts.low / total) * 100}%` }} />
        )}
      </div>
      <div className="flex items-center gap-3 text-[10px]">
        {counts.high > 0 && <span className="flex items-center gap-1 font-medium text-rose-600"><span className="h-2 w-2 rounded-full bg-rose-400" />{counts.high} High</span>}
        {counts.medium > 0 && <span className="flex items-center gap-1 font-medium text-amber-600"><span className="h-2 w-2 rounded-full bg-amber-400" />{counts.medium} Med</span>}
        {counts.low > 0 && <span className="flex items-center gap-1 font-medium text-teal-600"><span className="h-2 w-2 rounded-full bg-teal-400" />{counts.low} Low</span>}
      </div>
    </div>
  );
}

/* ── Main page ── */
export default function CompetitorAnalysis() {
  const { artifacts, hydrateLoading, steps } = useCampaignStore();
  const landscape = (artifacts as { competitor_landscape?: Record<string, unknown> }).competitor_landscape;
  const competitors = (landscape as { competitors?: Competitor[] })?.competitors;
  const opportunities = (landscape as { white_space_opportunities?: string[] })?.white_space_opportunities;
  const risks = (landscape as { risks?: string[] })?.risks;
  const reasoningSummary = (landscape as { reasoning_summary?: string })?.reasoning_summary;

  const restLandscape = landscape
    ? Object.fromEntries(
        Object.entries(landscape).filter(([k]) => !["competitors", "white_space_opportunities", "risks", "reasoning_summary"].includes(k))
      )
    : {};

  const src = collectSources(steps, (s) => sourceMatchers.researchCompetitor(s) || sourceMatchers.strategy(s));

  const [view, setView] = useState<"grid" | "table">("grid");
  const [selected, setSelected] = useState<number | null>(null);

  if (hydrateLoading) {
    return <div className="mx-auto max-w-6xl px-6 py-16 text-center text-sm text-slate-500">Loading competitor data...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50/90 to-white pb-16">
      <div className="border-b border-slate-200/80 bg-white/95 backdrop-blur-md">
        <div className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 text-white shadow-lg shadow-rose-200/40">
                <Swords size={22} />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-rose-600">Competitive intel</p>
                <h1 className="mt-0.5 font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Competitor analysis</h1>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
                  Landscape, differentiation angles, and gaps the creative stack can exploit — with trace-linked sources.
                </p>
              </div>
            </div>

            {competitors && competitors.length > 0 && (
              <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm">
                <button
                  type="button"
                  onClick={() => { setView("grid"); setSelected(null); }}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-all ${
                    view === "grid" ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <LayoutGrid size={12} />
                  Cards
                </button>
                <button
                  type="button"
                  onClick={() => { setView("table"); setSelected(null); }}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[11px] font-semibold transition-all ${
                    view === "table" ? "bg-slate-900 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  <Table2 size={12} />
                  Compare
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1120px] space-y-6 px-4 py-8 sm:px-6">
      {reasoningSummary && (
        <div className="anim-fade-up overflow-hidden rounded-2xl border border-indigo-100/90 bg-gradient-to-br from-indigo-50/80 via-white to-violet-50/40 p-6 shadow-md">
          <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">Synthesis</p>
          <p className="mt-3 text-sm leading-relaxed text-slate-800">{reasoningSummary}</p>
        </div>
      )}

      {/* ── Threat overview bar ── */}
      {competitors && competitors.length > 1 && <ThreatOverview competitors={competitors} />}

      {/* ── Competitor content ── */}
      {competitors && competitors.length > 0 ? (
        <>
          {/* Detail view (when a card is selected) */}
          {selected !== null && view === "grid" && competitors[selected] && (
            <CompetitorDetail comp={competitors[selected]} onClose={() => setSelected(null)} />
          )}

          {/* Grid view */}
          {view === "grid" && selected === null && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {competitors.map((c, i) => (
                <CompetitorCard key={i} comp={c} index={i} onSelect={() => setSelected(i)} />
              ))}
            </div>
          )}

          {/* Table view */}
          {view === "table" && <ComparisonTableFixed competitors={competitors} />}
        </>
      ) : landscape && Object.keys(landscape).length > 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <StructuredData value={landscape} />
        </div>
      ) : (
        <div className="anim-fade-in flex flex-col items-center rounded-2xl border border-slate-200 bg-white py-16 text-center shadow-sm">
          <div className="anim-float flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-100 to-orange-100">
            <Swords size={28} className="text-rose-400" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-slate-700">No competitor data yet</h3>
          <p className="mt-1 max-w-xs text-sm text-slate-400">Run a campaign to see competitive intelligence and market analysis.</p>
        </div>
      )}

      {/* ── Bottom insights row ── */}
      {(opportunities?.length || risks?.length) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* White space opportunities */}
          {opportunities && opportunities.length > 0 && (
            <div className="anim-fade-up rounded-2xl border border-teal-200/60 bg-gradient-to-br from-teal-50/60 to-emerald-50/30 p-5">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-500 text-white">
                  <Target size={14} />
                </div>
                <h2 className="text-sm font-bold text-slate-900">White Space Opportunities</h2>
              </div>
              <div className="space-y-2">
                {opportunities.map((o, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg bg-white/60 px-3 py-2">
                    <ArrowRight size={12} className="mt-0.5 flex-shrink-0 text-teal-500" />
                    <p className="text-xs leading-relaxed text-slate-700">{o}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Risks */}
          {risks && risks.length > 0 && (
            <div className="anim-fade-up rounded-2xl border border-amber-200/60 bg-gradient-to-br from-amber-50/60 to-orange-50/30 p-5">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500 text-white">
                  <AlertTriangle size={14} />
                </div>
                <h2 className="text-sm font-bold text-slate-900">Competitive Risks</h2>
              </div>
              <div className="space-y-2">
                {risks.map((r, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg bg-white/60 px-3 py-2">
                    <AlertTriangle size={12} className="mt-0.5 flex-shrink-0 text-amber-500" />
                    <p className="text-xs leading-relaxed text-slate-700">{r}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Extra landscape data ── */}
      {Object.keys(restLandscape).length > 0 && (
        <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm">
          <summary className="flex cursor-pointer items-center gap-2 px-5 py-3 text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-slate-600 transition-colors">
            <ChevronRight size={13} className="transition-transform group-open:rotate-90" />
            Additional Landscape Data
          </summary>
          <div className="border-t border-slate-100 px-5 py-4">
            <StructuredData value={restLandscape} />
          </div>
        </details>
      )}

      {/* ── Sources ── */}
      {src.length > 0 && (
        <div className="rounded-2xl border border-slate-200/60 bg-white px-5 py-4 shadow-sm">
          <SourceFootnotes sources={src} />
        </div>
      )}
      </div>
    </div>
  );
}

/* ── Fixed comparison table (no closure bug) ── */
function ComparisonTableFixed({ competitors }: { competitors: Competitor[] }) {
  return (
    <div className="anim-scale-in overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/80">
            <th className="sticky left-0 z-10 bg-slate-50/95 px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 min-w-[140px] backdrop-blur-sm">
              Competitor
            </th>
            <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 min-w-[100px]">Threat</th>
            <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 min-w-[280px]">Positioning</th>
            <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 min-w-[280px]">Differentiators</th>
          </tr>
        </thead>
        <tbody>
          {competitors.map((c, i) => {
            const threat = getThreat(c.threat_level);
            const ThreatIcon = threat.icon;
            const diffs = asStringList(c.differentiators);
            return (
              <tr
                key={i}
                className="anim-fade-up border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <td className="sticky left-0 z-10 bg-white px-4 py-3.5 font-semibold text-slate-900 backdrop-blur-sm">
                  <div className="flex items-center gap-2">
                    <Swords size={13} className={threat.text} />
                    {c.name}
                  </div>
                </td>
                <td className="px-4 py-3.5">
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${threat.bg} ${threat.text}`}>
                    <ThreatIcon size={9} />
                    {threat.label}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-slate-600 leading-relaxed">{c.positioning}</td>
                <td className="px-4 py-3.5">
                  <div className="flex flex-wrap gap-1">
                    {diffs.map((d, j) => (
                      <span key={j} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{d}</span>
                    ))}
                    {diffs.length === 0 && <span className="text-slate-300">—</span>}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
