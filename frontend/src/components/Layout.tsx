import { NavLink, Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Rocket,
  BarChart3,
  Swords,
  FileText,
  CalendarDays,
  TrendingUp,
  Bell,
  Shield,
  LogOut,
  QrCode,
  ChevronDown,
  Check,
  MessageSquare,
  UserCircle,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { useCampaignStore } from "./CampaignStore";
import { useState } from "react";

const NAV = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/ask", icon: MessageSquare, label: "Ask Agents" },
  { to: "/profile", icon: UserCircle, label: "Brand profile" },
  { to: "/campaign/new", icon: Rocket, label: "New Campaign" },
  { to: "/insights", icon: BarChart3, label: "Market Insights" },
  { to: "/competitors", icon: Swords, label: "Competitors" },
  { to: "/content", icon: FileText, label: "Content" },
  { to: "/calendar", icon: CalendarDays, label: "Calendar" },
  { to: "/performance", icon: TrendingUp, label: "Performance" },
  { to: "/offline", icon: QrCode, label: "QR offline" },
  { to: "/notifications", icon: Bell, label: "Alerts" },
  { to: "/admin", icon: Shield, label: "Admin" },
];

function CampaignSwitcher() {
  const { campaignList, campaignId, loadCampaign } = useCampaignStore();
  const [open, setOpen] = useState(false);

  const completed = campaignList.filter((c) => c.status === "completed");
  const current = completed.find((c) => c.id === campaignId);

  if (completed.length === 0) return null;

  return (
    <div className="relative px-3 py-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left transition hover:bg-slate-100"
      >
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Campaign</p>
          <p className="truncate text-xs font-semibold text-slate-800">
            {current?.brand_name || "Select campaign"}
          </p>
        </div>
        <ChevronDown size={14} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-3 right-3 top-full z-30 mt-1 max-h-[280px] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {completed.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                void loadCampaign(c.id);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left transition hover:bg-indigo-50 ${
                c.id === campaignId ? "bg-indigo-50" : ""
              }`}
            >
              <div className="flex-1 min-w-0">
                <p className="truncate text-xs font-semibold text-slate-800">{c.brand_name}</p>
                <p className="text-[10px] text-slate-400">
                  {c.created_at ? new Date(c.created_at).toLocaleDateString() : "Recent"}
                  {" · "}
                  {c.trace_step_count ?? c.trace?.length ?? 0} steps
                </p>
              </div>
              {c.id === campaignId && <Check size={14} className="flex-shrink-0 text-indigo-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Layout() {
  const { user, logOut } = useAuth();

  return (
    <div className="flex h-screen min-h-0 overflow-hidden bg-[#f4f6fb]">
      <aside className="hidden h-full min-h-0 w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex items-center gap-2.5 border-b border-slate-100 px-5 py-5">
          <img
            src="/assets/logo-knowyourbrand.png"
            alt=""
            className="h-9 w-9 rounded-xl object-cover shadow-sm ring-1 ring-slate-200/80"
          />
          <div>
            <p className="font-display text-sm font-bold tracking-tight text-slate-900">KnowYourBrand</p>
            <p className="text-[10px] text-slate-400">AI marketing intelligence</p>
          </div>
        </div>

        {/* Campaign switcher */}
        <CampaignSwitcher />

        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden px-3 py-2 thin-scroll">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/dashboard"}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  isActive
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                }`
              }
            >
              <n.icon size={18} />
              {n.label}
            </NavLink>
          ))}
        </nav>
        {user && (
          <div className="border-t border-slate-100 px-4 py-4">
            <div className="flex items-center gap-3">
              {user.photoURL ? (
                <img src={user.photoURL} alt="" className="h-8 w-8 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">
                  {(user.displayName || user.email || "U")[0].toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-slate-800">{user.displayName || "User"}</p>
                <p className="truncate text-[10px] text-slate-400">{user.email}</p>
              </div>
              <button onClick={() => void logOut()} className="text-slate-400 hover:text-rose-500" title="Sign out">
                <LogOut size={16} />
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Mobile top bar */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <div className="flex items-center gap-2">
            <img src="/assets/logo-knowyourbrand.png" alt="" className="h-8 w-8 rounded-lg object-cover" />
            <span className="font-display text-sm font-bold text-slate-900">KnowYourBrand</span>
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {NAV.slice(0, 5).map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === "/dashboard"}
                className={({ isActive }) =>
                  `rounded-lg px-2 py-1 text-[10px] font-medium ${
                    isActive ? "bg-indigo-100 text-indigo-700" : "text-slate-500"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
