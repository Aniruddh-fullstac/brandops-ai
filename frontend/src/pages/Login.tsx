import { useAuth } from "../contexts/AuthContext";
import { Link, Navigate } from "react-router-dom";

export default function Login() {
  const { user, loading, signIn } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f6fb]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }

  if (user) return <Navigate to="/dashboard" replace />;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#f4f6fb] via-indigo-50/40 to-teal-50/30 px-4 py-8">
      <Link to="/" className="mb-6 text-sm font-medium text-slate-500 transition hover:text-indigo-600">
        ← Back to KnowYourBrand
      </Link>
      <div className="w-full max-w-md space-y-8 rounded-3xl border border-slate-200 bg-white p-10 shadow-lg">
        <div className="text-center">
          <img
            src="/assets/logo-knowyourbrand.png"
            alt=""
            className="mx-auto mb-4 h-16 w-16 rounded-2xl object-cover shadow-lg ring-1 ring-slate-200/80"
          />
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">KnowYourBrand</h1>
          <p className="mt-2 text-sm text-slate-600">
            AI-powered marketing intelligence. Sign in to access your brand dashboard.
          </p>
        </div>
        <button
          onClick={() => void signIn()}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:shadow"
        >
          <svg width="18" height="18" viewBox="0 0 24 24">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          Continue with Google
        </button>
        <p className="text-center text-xs text-slate-400">
          Your data stays private. We use Firebase Auth for secure, passwordless access.
        </p>
      </div>
    </div>
  );
}
