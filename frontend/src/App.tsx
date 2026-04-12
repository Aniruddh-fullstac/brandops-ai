import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { CampaignStoreProvider } from "./components/CampaignStore";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import NewCampaign from "./pages/NewCampaign";
import BrandProfile from "./pages/BrandProfile";
import MarketInsights from "./pages/MarketInsights";
import CompetitorAnalysis from "./pages/CompetitorAnalysis";
import ContentOutputs from "./pages/ContentOutputs";
import CampaignCalendar from "./pages/CampaignCalendar";
import PerformanceSimulation from "./pages/PerformanceSimulation";
import Notifications from "./pages/Notifications";
import AdminDashboard from "./pages/AdminDashboard";
import AskAgent from "./pages/AskAgent";
import OfflineCampaigns from "./pages/OfflineCampaigns";
import OfflineCampaignAnalytics from "./pages/OfflineCampaignAnalytics";
import PublicOfflineLanding from "./pages/PublicOfflineLanding";
import Landing from "./pages/Landing";
import { isAdminEmail } from "./lib/admin";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (!isAdminEmail(user.email)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CampaignStoreProvider>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/p/:slug" element={<PublicOfflineLanding />} />
            <Route
              element={
                <RequireAuth>
                  <Layout />
                </RequireAuth>
              }
            >
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="campaign/new" element={<NewCampaign />} />
              <Route path="profile" element={<BrandProfile />} />
              <Route path="insights" element={<MarketInsights />} />
              <Route path="competitors" element={<CompetitorAnalysis />} />
              <Route path="content" element={<ContentOutputs />} />
              <Route path="calendar" element={<CampaignCalendar />} />
              <Route path="performance" element={<PerformanceSimulation />} />
              <Route path="notifications" element={<Notifications />} />
              <Route path="offline" element={<OfflineCampaigns />} />
              <Route path="offline/:campaignId/analytics" element={<OfflineCampaignAnalytics />} />
              <Route path="ask" element={<AskAgent />} />
              <Route
                path="admin"
                element={
                  <RequireAdmin>
                    <AdminDashboard />
                  </RequireAdmin>
                }
              />
            </Route>
          </Routes>
        </CampaignStoreProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
