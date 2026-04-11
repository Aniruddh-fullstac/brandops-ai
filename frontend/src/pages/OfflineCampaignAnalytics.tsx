import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  Download,
  Globe2,
  Layers,
  LineChart as LineChartIcon,
  MapPin,
  MousePointerClick,
  PieChart as PieIcon,
  RefreshCw,
  Timer,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiBlob, apiJson } from "../lib/api";

const CHART_COLORS = ["#6366f1", "#14b8a6", "#f43f5e", "#f59e0b", "#8b5cf6", "#0ea5e9", "#a855f7", "#ec4899"];

type FullAnalytics = {
  totals: {
    responses: number;
    page_views?: number;
    unique_sessions?: number;
    unique_sessions_page_views?: number;
    return_visits: number;
    conversion_pct?: number | null;
    total_tracked_events?: number;
  };
  funnel?: { step: string; count: number }[];
  events?: { by_type: { name: string; count: number }[]; clicks_and_interactions?: number };
  timeline?: {
    by_day: { date: string; views: number; submits: number }[];
    by_hour_utc: { hour: number; views: number; submits: number }[];
  };
  geo: {
    by_country: { name: string; count: number }[];
    by_city: { name: string; count: number }[];
    by_region: { name: string; count: number }[];
    top_isp: { name: string; count: number }[];
    by_country_from_views?: { name: string; count: number }[];
    by_city_from_views?: { name: string; count: number }[];
  };
  products: { name: string; count: number }[];
  interests: { name: string; count: number }[];
  ratings: { avg: number | null; distribution: Record<string, number> };
  age_ranges: { name: string; count: number }[];
  engagement: { new_visitors: number; returning_visitors: number };
  affinity: { a: string; b: string; count: number }[];
  retargeting: { eligible_emails: number; with_marketing_consent: number };
  locations: { name: string; count: number }[];
  locations_from_page_views_only?: { name: string; count: number }[];
  locations_from_submissions_only?: { name: string; count: number }[];
};

function MiniBar({
  label,
  count,
  max,
  color = "bg-indigo-500",
}: {
  label: string;
  count: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-40 shrink-0 truncate text-slate-600" title={label}>
        {label}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-7 shrink-0 text-right font-semibold text-slate-800">{count}</span>
    </div>
  );
}

export default function OfflineCampaignAnalytics() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [data, setData] = useState<FullAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await apiJson<{ campaign: { title?: string; slug?: string }; analytics: FullAnalytics }>(
        `/api/offline/campaigns/${campaignId}/analytics`
      );
      setTitle(r.campaign?.title || "Campaign");
      setSlug(r.campaign?.slug || "");
      setData(r.analytics);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportCsv = async () => {
    if (!campaignId) return;
    const blob = await apiBlob(`/api/offline/campaigns/${campaignId}/export.csv`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `offline-${slug || campaignId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!campaignId) {
    return <p className="p-8 text-sm text-slate-500">Invalid campaign.</p>;
  }

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }

  if (err || !data) {
    return (
      <div className="p-8">
        <button type="button" onClick={() => navigate("/offline")} className="text-sm text-indigo-600 hover:underline">
          ← Back to QR campaigns
        </button>
        <p className="mt-4 text-rose-600">{err || "No data"}</p>
      </div>
    );
  }

  const maxP = Math.max(0, ...data.products.map((p) => p.count));
  const maxI = Math.max(0, ...data.interests.map((p) => p.count));
  const maxC = Math.max(0, ...data.geo.by_country.map((p) => p.count));
  const maxCv = Math.max(0, ...(data.geo.by_country_from_views || []).map((p) => p.count));
  const daySlice = (data.timeline?.by_day || []).slice(-45);
  const ratingRows = Object.entries(data.ratings.distribution || {}).map(([k, v]) => ({ star: `${k}★`, count: v }));

  return (
    <div className="min-h-screen bg-[#f4f6fb] p-4 pb-16 lg:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 border-b border-slate-200/80 pb-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <button
              type="button"
              onClick={() => navigate("/offline")}
              className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-800"
            >
              <ArrowLeft className="h-4 w-4" />
              QR campaigns
            </button>
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 lg:text-3xl">
              Analytics — {title}
            </h1>
            <p className="mt-1 font-mono text-xs text-slate-400">{slug}</p>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Full funnel: landing views (telemetry), interactions, and survey submissions. Placements use{" "}
              <code className="rounded bg-white px-1 py-0.5 text-[11px]">?loc=</code> or campaign default QR location.
              Times are <strong>UTC</strong>.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void exportCsv()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
            <Link
              to="/offline"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white"
            >
              Manage campaign
            </Link>
          </div>
        </div>

        {/* KPI strip */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {[
            { label: "Landing views", value: data.totals.page_views ?? 0, icon: Globe2, sub: "Telemetry page_view" },
            { label: "Submissions", value: data.totals.responses, icon: Users, sub: "Survey completed" },
            {
              label: "Conversion",
              value: data.totals.conversion_pct != null ? `${data.totals.conversion_pct}%` : "—",
              icon: BarChart3,
              sub: "Submit / views",
            },
            { label: "Tracked events", value: data.totals.total_tracked_events ?? 0, icon: MousePointerClick, sub: "All event types" },
            { label: "Return visits", value: data.totals.return_visits, icon: RefreshCw, sub: "Repeat sessions" },
            { label: "Marketing opt-in", value: data.retargeting.with_marketing_consent, icon: Layers, sub: "Emails + consent" },
            { label: "Session reach (PV)", value: data.totals.unique_sessions_page_views ?? 0, icon: Timer, sub: "Unique sessions" },
          ].map((k) => (
            <div key={k.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <k.icon className="h-5 w-5 text-indigo-500" />
              <p className="mt-2 text-2xl font-bold text-slate-900">{k.value}</p>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
              <p className="mt-1 text-[10px] text-slate-400">{k.sub}</p>
            </div>
          ))}
        </div>

        {/* Funnel */}
        {data.funnel && data.funnel.length > 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-display flex items-center gap-2 text-lg font-bold text-slate-900">
              <Layers className="h-5 w-5 text-indigo-600" />
              Funnel
            </h2>
            <div className="mt-4 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.funnel} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" />
                  <YAxis dataKey="step" type="category" width={200} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#6366f1" radius={[0, 8, 8, 0]} name="Count" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {/* Time: daily */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-display flex items-center gap-2 text-lg font-bold text-slate-900">
            <LineChartIcon className="h-5 w-5 text-teal-600" />
            Activity over time (UTC) — last {daySlice.length} days
          </h2>
          <div className="mt-4 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daySlice}>
                <defs>
                  <linearGradient id="colorV" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorS" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#14b8a6" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Area type="monotone" dataKey="views" stroke="#6366f1" fillOpacity={1} fill="url(#colorV)" name="Landing views" />
                <Area type="monotone" dataKey="submits" stroke="#14b8a6" fillOpacity={1} fill="url(#colorS)" name="Submissions" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Hour of day */}
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-display flex items-center gap-2 text-lg font-bold text-slate-900">
            <Timer className="h-5 w-5 text-amber-600" />
            Hour of day (UTC)
          </h2>
          <div className="mt-4 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.timeline?.by_hour_utc || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="views" fill="#6366f1" name="Views" radius={[2, 2, 0, 0]} />
                <Bar dataKey="submits" fill="#14b8a6" name="Submits" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-display flex items-center gap-2 text-lg font-bold text-slate-900">
              <PieIcon className="h-5 w-5 text-rose-500" />
              Age (submissions)
            </h2>
            <div className="mt-4 h-72">
              {data.age_ranges.length === 0 ? (
                <p className="py-16 text-center text-sm text-slate-400">No age data yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data.age_ranges}
                      dataKey="count"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={90}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {data.age_ranges.map((_, i) => (
                        <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-display flex items-center gap-2 text-lg font-bold text-slate-900">
              <BarChart3 className="h-5 w-5 text-amber-500" />
              Rating distribution
            </h2>
            <div className="mt-4 h-72">
              {ratingRows.length === 0 ? (
                <p className="py-16 text-center text-sm text-slate-400">No ratings yet.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={ratingRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="star" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#f59e0b" radius={[8, 8, 0, 0]} name="Responses" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
            {data.ratings.avg != null && (
              <p className="mt-2 text-center text-sm text-slate-600">
                Average: <strong>{data.ratings.avg}</strong> / 5
              </p>
            )}
          </section>
        </div>

        {/* Event types */}
        {data.events?.by_type && data.events.by_type.length > 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-display flex items-center gap-2 text-lg font-bold text-slate-900">
              <MousePointerClick className="h-5 w-5 text-violet-600" />
              Interaction & event types
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Clicks & interactions (excluding raw page_view): {data.events.clicks_and_interactions ?? 0}
            </p>
            <div className="mt-4 h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.events.by_type} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" />
                  <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#8b5cf6" radius={[0, 6, 6, 0]} name="Events" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}

        {/* Geo */}
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
              <Globe2 className="h-5 w-5 text-indigo-600" />
              Country (submissions)
            </h2>
            <div className="mt-4 space-y-2">
              {data.geo.by_country.length === 0 ? (
                <p className="text-sm text-slate-400">No data — submit once from a real network (not only localhost).</p>
              ) : (
                data.geo.by_country.map((x) => <MiniBar key={x.name} label={x.name} count={x.count} max={maxC || 1} />)
              )}
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
              <Globe2 className="h-5 w-5 text-teal-600" />
              Country (landing views)
            </h2>
            <div className="mt-4 space-y-2">
              {(data.geo.by_country_from_views || []).length === 0 ? (
                <p className="text-sm text-slate-400">No view telemetry yet — open the landing page once to record page_view.</p>
              ) : (
                (data.geo.by_country_from_views || []).map((x) => (
                  <MiniBar key={x.name} label={x.name} count={x.count} max={maxCv || 1} color="bg-teal-500" />
                ))
              )}
            </div>
          </section>
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
            <MapPin className="h-5 w-5 text-amber-600" />
            Placements & locations
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Merged = page views + submissions with <code className="rounded bg-slate-100 px-1">loc</code>. Set default on
            campaign or use <code className="rounded bg-slate-100 px-1">?loc=store-id</code> in the URL.
          </p>
          <div className="mt-4 grid gap-6 lg:grid-cols-3">
            <div>
              <p className="text-xs font-bold uppercase text-slate-400">Merged</p>
              <div className="mt-2 space-y-2">
                {(data.locations || []).length === 0 ? (
                  <p className="text-sm text-slate-400">None yet.</p>
                ) : (
                  data.locations.map((x) => <MiniBar key={x.name} label={x.name} count={x.count} max={maxP || 1} />)
                )}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-400">From views only</p>
              <div className="mt-2 space-y-2">
                {(data.locations_from_page_views_only || []).length === 0 ? (
                  <p className="text-sm text-slate-400">—</p>
                ) : (
                  (data.locations_from_page_views_only || []).map((x) => (
                    <MiniBar key={x.name} label={x.name} count={x.count} max={maxP || 1} color="bg-teal-500" />
                  ))
                )}
              </div>
            </div>
            <div>
              <p className="text-xs font-bold uppercase text-slate-400">From submissions only</p>
              <div className="mt-2 space-y-2">
                {(data.locations_from_submissions_only || []).length === 0 ? (
                  <p className="text-sm text-slate-400">—</p>
                ) : (
                  (data.locations_from_submissions_only || []).map((x) => (
                    <MiniBar key={x.name} label={x.name} count={x.count} max={maxP || 1} color="bg-indigo-400" />
                  ))
                )}
              </div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-display text-lg font-bold text-slate-900">Product interest</h2>
            <div className="mt-4 space-y-2">
              {data.products.length === 0 ? (
                <p className="text-sm text-slate-400">No selections.</p>
              ) : (
                data.products.map((x) => <MiniBar key={x.name} label={x.name} count={x.count} max={maxP || 1} />)
              )}
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-display text-lg font-bold text-slate-900">Interest tags</h2>
            <div className="mt-4 space-y-2">
              {data.interests.length === 0 ? (
                <p className="text-sm text-slate-400">None.</p>
              ) : (
                data.interests.map((x) => (
                  <MiniBar key={x.name} label={x.name} count={x.count} max={maxI || 1} color="bg-violet-500" />
                ))
              )}
            </div>
          </section>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-display text-lg font-bold text-slate-900">Cities (submissions)</h2>
            <div className="mt-4 space-y-2">
              {data.geo.by_city.slice(0, 12).map((x) => (
                <MiniBar key={x.name} label={x.name} count={x.count} max={maxC || 1} />
              ))}
            </div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-display text-lg font-bold text-slate-900">Regions & ISP</h2>
            <p className="text-xs text-slate-500">Region (IP-based)</p>
            <div className="mt-2 space-y-2">
              {data.geo.by_region.slice(0, 10).map((x) => (
                <MiniBar key={x.name} label={x.name} count={x.count} max={maxC || 1} color="bg-slate-500" />
              ))}
            </div>
            <p className="mt-4 text-xs text-slate-500">ISP</p>
            <div className="mt-2 space-y-2">
              {data.geo.top_isp.slice(0, 8).map((x) => (
                <MiniBar key={x.name} label={x.name} count={x.count} max={maxC || 1} color="bg-slate-400" />
              ))}
            </div>
          </section>
        </div>

        {data.affinity.length > 0 && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="font-display text-lg font-bold text-slate-900">Product affinity (pairs)</h2>
            <ul className="mt-3 space-y-1 text-sm text-slate-700">
              {data.affinity.map((a) => (
                <li key={`${a.a}-${a.b}`}>
                  <span className="font-medium">{a.a}</span> + <span className="font-medium">{a.b}</span>{" "}
                  <span className="text-slate-400">({a.count})</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
