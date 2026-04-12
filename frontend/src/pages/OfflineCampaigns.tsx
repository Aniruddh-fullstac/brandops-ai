import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3,
  Download,
  ExternalLink,
  Image as ImageIcon,
  MapPin,
  Plus,
  QrCode,
  RefreshCw,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Users,
} from "lucide-react";
import { apiBlob, apiJson } from "../lib/api";
import { useCampaignStore } from "../components/CampaignStore";
import { buildOfflinePrefillFromCampaign } from "../lib/offlinePrefill";

type OfflineRow = {
  id: string;
  slug: string;
  title: string;
  headline?: string;
  description?: string;
  brand_name?: string;
  status?: string;
  promo_image_urls?: string[];
  product_options?: string[];
  interest_tags?: string[];
  landing_url?: string;
  default_qr_location?: string;
  created_at?: string;
  /** Main (agent) campaign this QR bundle was created from, if any */
  source_campaign_id?: string;
};

type Analytics = {
  totals: {
    responses: number;
    unique_sessions?: number;
    page_views?: number;
    conversion_pct?: number | null;
    total_tracked_events?: number;
    return_visits: number;
  };
  geo: { by_country: { name: string; count: number }[]; by_city: { name: string; count: number }[] };
  products: { name: string; count: number }[];
  interests: { name: string; count: number }[];
  ratings: { avg: number | null; distribution: Record<string, number> };
  age_ranges: { name: string; count: number }[];
  engagement: { new_visitors: number; returning_visitors: number };
  affinity: { a: string; b: string; count: number }[];
  retargeting: { eligible_emails: number; with_marketing_consent: number };
  locations: { name: string; count: number }[];
};

function BarRow({ label, count, max }: { label: string; count: number; max: number }) {
  const pct = max > 0 ? Math.round((count / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-36 shrink-0 truncate text-slate-600" title={label}>
        {label}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-teal-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 shrink-0 text-right font-semibold text-slate-800">{count}</span>
    </div>
  );
}

const EMPTY_FORM = {
  title: "",
  headline: "",
  description: "",
  brand_name: "",
  promo_image_urls: "",
  product_options: "Limited drop, Core line, Collab, Accessories",
  interest_tags: "Streetwear, Sustainability, Tech, Travel",
  default_qr_location: "",
  status: "active" as "draft" | "active",
};

export default function OfflineCampaigns() {
  const { campaignId, campaignList, artifacts } = useCampaignStore();
  const [campaigns, setCampaigns] = useState<OfflineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<OfflineRow | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  /** null | from-global (minimal) | standalone (full form) */
  const [createModal, setCreateModal] = useState<null | "from-global" | "standalone">(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const lastCampaignId = useRef<string | null | undefined>(undefined);
  const hadCampaigns = useRef(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiJson<{ campaigns: OfflineRow[] }>("/api/offline/campaigns");
      setCampaigns(r.campaigns || []);
    } catch {
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** When the global (header) campaign changes, or offline list first loads, select the QR row linked to it. */
  useEffect(() => {
    const cid = campaignId ?? null;
    const globalSwitched = lastCampaignId.current !== cid;
    lastCampaignId.current = cid;

    const listJustLoaded = !hadCampaigns.current && campaigns.length > 0;
    hadCampaigns.current = campaigns.length > 0;

    if (!cid || !campaigns.length) return;
    const linked = campaigns.find((c) => c.source_campaign_id === cid);
    if (!linked) return;
    if (globalSwitched || listJustLoaded) setSelected(linked);
  }, [campaigns, campaignId]);

  const mainCampaign = campaignList.find((c) => c.id === campaignId);

  const openStandaloneModal = () => {
    setForm({ ...EMPTY_FORM });
    setCreateModal("standalone");
  };

  const openFromGlobalModal = () => {
    if (!campaignId) return;
    const pre = buildOfflinePrefillFromCampaign(mainCampaign, artifacts);
    setForm({ ...pre, default_qr_location: "", status: "active" });
    setCreateModal("from-global");
  };

  /** Prefer existing QR for the selected main campaign; otherwise open the minimal create dialog. */
  const ensureQrForCurrentCampaign = () => {
    if (!campaignId) return;
    const linked = campaigns.find((c) => c.source_campaign_id === campaignId);
    if (linked) {
      setSelected(linked);
      return;
    }
    openFromGlobalModal();
  };

  const loadAnalytics = useCallback(async (id: string) => {
    setAnalyticsLoading(true);
    try {
      const r = await apiJson<{ analytics: Analytics }>(`/api/offline/campaigns/${id}/analytics`);
      setAnalytics(r.analytics);
    } catch {
      setAnalytics(null);
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected?.id) void loadAnalytics(selected.id);
    else setAnalytics(null);
  }, [selected?.id, loadAnalytics]);

  const createCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const promo_image_urls = form.promo_image_urls
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const product_options = form.product_options.split(",").map((s) => s.trim()).filter(Boolean);
      const interest_tags = form.interest_tags.split(",").map((s) => s.trim()).filter(Boolean);
      const linkMain =
        createModal === "from-global" && campaignId ? { source_campaign_id: campaignId } : {};
      const res = await apiJson<{ id: string; slug: string; landing_url: string; campaign: OfflineRow }>(
        "/api/offline/campaigns",
        {
          method: "POST",
          body: JSON.stringify({
            title: form.title,
            headline: form.headline,
            description: form.description,
            brand_name: form.brand_name,
            promo_image_urls,
            product_options,
            interest_tags,
            collect_name: true,
            collect_email: true,
            collect_phone: false,
            collect_age_range: true,
            status: form.status,
            default_qr_location: form.default_qr_location.trim() || undefined,
            ...linkMain,
          }),
        }
      );
      setCreateModal(null);
      setForm({ ...EMPTY_FORM });
      await refresh();
      setSelected({ ...res.campaign, id: res.id, slug: res.slug, landing_url: res.landing_url });
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (c: OfflineRow) => {
    const next = c.status === "active" ? "draft" : "active";
    await apiJson(`/api/offline/campaigns/${c.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: next }),
    });
    await refresh();
    if (selected?.id === c.id) setSelected({ ...c, status: next });
  };

  const downloadQr = async (c: OfflineRow) => {
    const blob = await apiBlob(`/api/offline/campaigns/${c.id}/qr.png`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `qr-${c.slug}.png`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = async (c: OfflineRow) => {
    const blob = await apiBlob(`/api/offline/campaigns/${c.id}/export.csv`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `offline-${c.slug}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const maxProduct = Math.max(0, ...(analytics?.products.map((p) => p.count) || []));
  const maxCountry = Math.max(0, ...(analytics?.geo.by_country.map((p) => p.count) || []));
  const maxLoc = Math.max(0, ...(analytics?.locations.map((p) => p.count) || []));

  return (
    <div className="p-6 lg:p-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-indigo-600">
              <QrCode className="h-6 w-6" />
              <span className="text-xs font-bold uppercase tracking-widest">Offline</span>
            </div>
            <h1 className="font-display mt-1 text-3xl font-bold tracking-tight text-slate-900">QR campaigns</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600">
              Print QR codes for posters and retail. Scans open a branded micro-experience: promos, a short survey, and
              analytics — including approximate region and return-visit signals for retargeting exports.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refresh()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-teal-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-indigo-500/20"
            >
              <Plus className="h-4 w-4" />
              New QR campaign
            </button>
          </div>
        </div>

        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
              <h2 className="font-display text-lg font-bold text-slate-900">Create campaign</h2>
              <form className="mt-4 space-y-3" onSubmit={createCampaign}>
                <label className="block text-xs font-semibold text-slate-500">Title</label>
                <input
                  required
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
                <label className="block text-xs font-semibold text-slate-500">Brand name</label>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={form.brand_name}
                  onChange={(e) => setForm((f) => ({ ...f, brand_name: e.target.value }))}
                />
                <label className="block text-xs font-semibold text-slate-500">Headline</label>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={form.headline}
                  onChange={(e) => setForm((f) => ({ ...f, headline: e.target.value }))}
                />
                <label className="block text-xs font-semibold text-slate-500">Description</label>
                <textarea
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
                <label className="block text-xs font-semibold text-slate-500">Promo image URLs (one per line)</label>
                <textarea
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs"
                  rows={3}
                  placeholder="https://..."
                  value={form.promo_image_urls}
                  onChange={(e) => setForm((f) => ({ ...f, promo_image_urls: e.target.value }))}
                />
                <label className="block text-xs font-semibold text-slate-500">Product options (comma-separated)</label>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={form.product_options}
                  onChange={(e) => setForm((f) => ({ ...f, product_options: e.target.value }))}
                />
                <label className="block text-xs font-semibold text-slate-500">Interest tags (comma-separated)</label>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  value={form.interest_tags}
                  onChange={(e) => setForm((f) => ({ ...f, interest_tags: e.target.value }))}
                />
                <label className="block text-xs font-semibold text-slate-500">
                  Default placement / store id (optional — adds ?loc= to QR & links)
                </label>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-sm"
                  placeholder="e.g. mall-north-01"
                  value={form.default_qr_location}
                  onChange={(e) => setForm((f) => ({ ...f, default_qr_location: e.target.value }))}
                />
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.status === "active"}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.checked ? "active" : "draft" }))}
                  />
                  Publish immediately (active)
                </label>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                    onClick={() => setShowCreate(false)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Create"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <div className="mt-10 grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Campaigns</h3>
              {loading ? (
                <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
              ) : campaigns.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">No offline campaigns yet.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {campaigns.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => setSelected(c)}
                        className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                          selected?.id === c.id
                            ? "border-indigo-300 bg-indigo-50"
                            : "border-slate-100 bg-slate-50/80 hover:border-slate-200"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900">{c.title}</span>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              c.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-600"
                            }`}
                          >
                            {c.status || "draft"}
                          </span>
                        </div>
                        <p className="mt-1 truncate font-mono text-[10px] text-slate-400">{c.slug}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="lg:col-span-7">
            {!selected ? (
              <div className="flex min-h-[320px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/50 p-8 text-center">
                <Sparkles className="h-10 w-10 text-indigo-300" />
                <p className="mt-4 text-sm font-medium text-slate-600">Select a campaign to view analytics & QR</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="font-display text-xl font-bold text-slate-900">{selected.title}</h2>
                      <p className="mt-1 text-sm text-slate-500">{selected.headline}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void toggleStatus(selected)}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700"
                    >
                      {selected.status === "active" ? (
                        <>
                          <ToggleRight className="h-5 w-5 text-emerald-500" /> Active
                        </>
                      ) : (
                        <>
                          <ToggleLeft className="h-5 w-5 text-slate-400" /> Draft
                        </>
                      )}
                    </button>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {selected.landing_url && (
                      <a
                        href={selected.landing_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open landing
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => void downloadQr(selected)}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-800"
                    >
                      <QrCode className="h-3.5 w-3.5" />
                      Download QR
                    </button>
                    <button
                      type="button"
                      onClick={() => void exportCsv(selected)}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-800"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Export CSV
                    </button>
                    <Link
                      to={`/offline/${selected.id}/analytics`}
                      className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-xs font-bold text-white shadow-md"
                    >
                      <BarChart3 className="h-3.5 w-3.5" />
                      Full analytics dashboard
                    </Link>
                  </div>

                  <p className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      Set <strong>default placement</strong> when creating a campaign (or append{" "}
                      <code className="rounded bg-amber-100 px-1">?loc=your-store-id</code>) so scans record location on{" "}
                      <strong>first page view</strong>, not only on submit. Download QR after saving — it includes{" "}
                      <code className="rounded bg-amber-100 px-1">?loc=</code> when configured.
                    </span>
                  </p>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-slate-900">
                      <BarChart3 className="h-5 w-5 text-indigo-600" />
                      <h3 className="font-display font-bold">Quick snapshot</h3>
                    </div>
                    <Link
                      to={`/offline/${selected.id}/analytics`}
                      className="text-xs font-bold text-indigo-600 hover:underline"
                    >
                      Open full dashboard →
                    </Link>
                  </div>
                  {analyticsLoading ? (
                    <p className="mt-4 text-sm text-slate-500">Loading analytics…</p>
                  ) : analytics ? (
                    <div className="mt-6 space-y-6">
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-xl bg-slate-50 p-4">
                          <p className="text-2xl font-bold text-slate-900">{analytics.totals.page_views ?? 0}</p>
                          <p className="text-xs text-slate-500">Landing views (telemetry)</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-4">
                          <Users className="h-5 w-5 text-indigo-500" />
                          <p className="mt-2 text-2xl font-bold text-slate-900">{analytics.totals.responses}</p>
                          <p className="text-xs text-slate-500">Submissions</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-4">
                          <p className="text-2xl font-bold text-slate-900">
                            {analytics.totals.conversion_pct != null ? `${analytics.totals.conversion_pct}%` : "—"}
                          </p>
                          <p className="text-xs text-slate-500">Conversion (submit ÷ views)</p>
                        </div>
                        <div className="rounded-xl bg-slate-50 p-4">
                          <ImageIcon className="h-5 w-5 text-rose-500" />
                          <p className="mt-2 text-2xl font-bold text-slate-900">
                            {analytics.retargeting.with_marketing_consent}
                          </p>
                          <p className="text-xs text-slate-500">Marketing opt-in</p>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Geo (submissions)</h4>
                        <div className="mt-3 space-y-2">
                          {analytics.geo.by_country.length === 0 ? (
                            <p className="text-sm text-slate-400">No geo from submissions yet.</p>
                          ) : (
                            analytics.geo.by_country.slice(0, 6).map((x) => (
                              <BarRow key={x.name} label={x.name} count={x.count} max={maxCountry || 1} />
                            ))
                          )}
                        </div>
                      </div>

                      {analytics.locations.filter((l) => l.name).length > 0 && (
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                            Placements (merged)
                          </h4>
                          <div className="mt-2 space-y-2">
                            {analytics.locations
                              .filter((l) => l.name)
                              .slice(0, 8)
                              .map((x) => (
                                <BarRow key={x.name} label={x.name} count={x.count} max={maxLoc || 1} />
                              ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-slate-500">No data.</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
