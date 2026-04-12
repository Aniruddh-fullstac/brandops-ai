import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Rocket, FileText, TrendingUp, BarChart3, UserCircle } from "lucide-react";
import { apiJson } from "../lib/api";
import { useCampaignStore } from "../components/CampaignStore";
import type { CampaignRecord } from "../types";

export default function Dashboard() {
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const { artifacts, refreshFromServer, hydrateLoading, loadCampaign, campaignId } = useCampaignStore();

  useEffect(() => {
    apiJson<{ campaigns: CampaignRecord[] }>("/api/campaigns")
      .then((d) => setCampaigns(d.campaigns || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const completed = campaigns.filter((c) => c.status === "completed");
  const latest = completed[0];
  const execSummary =
    (artifacts.executive_summary as string | undefined) ||
    (latest?.artifacts as { executive_summary?: string } | undefined)?.executive_summary;

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-6 py-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Brand Dashboard</h1>
        <p className="mt-1 text-sm text-slate-600">Overview of your AI-generated campaigns and market intelligence.</p>
      </div>

      {/* Quick stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Campaigns", value: campaigns.length, icon: FileText, color: "indigo" },
          { label: "Completed", value: completed.length, icon: TrendingUp, color: "teal" },
          { label: "Running", value: campaigns.filter((c) => c.status === "running").length, icon: BarChart3, color: "amber" },
          {
            label: "Agents Used",
            value: latest?.trace?.length || 0,
            icon: Rocket,
            color: "purple",
          },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-xl bg-${s.color}-100 text-${s.color}-600`}
              >
                <s.icon size={20} />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-slate-900">{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Recent campaigns */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold text-slate-900">Recent Campaigns</h2>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void refreshFromServer()}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Sync data
            </button>
            <Link
              to="/campaign/new?profile=1"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <UserCircle size={14} className="text-indigo-600" />
              Client profile
            </Link>
            <Link
              to="/campaign/new"
              className="rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
            >
              + New Campaign
            </Link>
          </div>
        </div>
        {loading || hydrateLoading ? (
          <p className="mt-4 text-sm text-slate-500">Loading…</p>
        ) : campaigns.length === 0 ? (
          <div className="mt-8 text-center">
            <Rocket className="mx-auto text-slate-300" size={40} />
            <p className="mt-3 text-sm text-slate-500">No campaigns yet. Run your first one!</p>
            <Link
              to="/campaign/new"
              className="mt-4 inline-block rounded-xl bg-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
            >
              Create Campaign
            </Link>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {campaigns.slice(0, 10).map((c) => (
              <button
                key={c.id}
                onClick={() => c.status === "completed" && void loadCampaign(c.id)}
                className={`flex w-full items-center justify-between rounded-xl border p-4 text-left transition-all ${
                  c.id === campaignId
                    ? "border-indigo-200 bg-indigo-50/50 ring-1 ring-indigo-100"
                    : "border-slate-100 bg-slate-50/50 hover:border-slate-200 hover:shadow-sm"
                } ${c.status === "completed" ? "cursor-pointer" : "cursor-default opacity-70"}`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-slate-900">{c.brand_name}</p>
                    {c.id === campaignId && (
                      <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[8px] font-bold text-indigo-600 uppercase">Active</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    {c.created_at ? new Date(c.created_at).toLocaleDateString() : "Recent"} · {c.trace?.length || 0} agent
                    steps
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase ${
                    c.status === "completed"
                      ? "bg-teal-100 text-teal-800"
                      : c.status === "running"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-rose-100 text-rose-800"
                  }`}
                >
                  {c.status}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Latest exec summary — from hydrated store (full artifacts) or API list */}
      {execSummary && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-display text-lg font-semibold text-slate-900">Latest Executive Summary</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">{String(execSummary)}</p>
        </div>
      )}
    </div>
  );
}
