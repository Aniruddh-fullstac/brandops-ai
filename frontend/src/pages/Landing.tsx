import { Link, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  FileText,
  MessageSquare,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { useAuth } from "../contexts/AuthContext";

const heroContainer = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08 },
  },
};

const heroItem = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
};

export default function Landing() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f6fb]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600" />
      </div>
    );
  }
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-[#f4f6fb] text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <Link to="/" className="flex items-center gap-3">
            <img
              src="/assets/logo-knowyourbrand.png"
              alt=""
              className="h-10 w-10 rounded-xl object-cover shadow-sm ring-1 ring-slate-200/80"
            />
            <div>
              <p className="font-display text-base font-bold tracking-tight text-slate-900">KnowYourBrand</p>
              <p className="text-[11px] text-slate-500">AI marketing intelligence</p>
            </div>
          </Link>
          <nav className="flex items-center gap-3">
            <Link
              to="/login"
              className="hidden text-sm font-medium text-slate-600 transition hover:text-slate-900 sm:inline"
            >
              Sign in
            </Link>
            <Link
              to="/login"
              className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <section className="relative overflow-hidden border-b border-slate-200/60 bg-gradient-to-b from-white to-[#f4f6fb]">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-12 lg:py-24">
          <motion.div
            initial="hidden"
            animate="show"
            variants={heroContainer}
            className="max-w-xl"
          >
            <motion.div variants={heroItem} className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-indigo-700">
              <Sparkles size={12} />
              Multi-agent creative engine
            </motion.div>
            <motion.h1
              variants={heroItem}
              className="mt-5 font-display text-4xl font-bold leading-[1.1] tracking-tight text-slate-900 sm:text-5xl"
            >
              Understand your brand. Ship campaigns that land.
            </motion.h1>
            <motion.p variants={heroItem} className="mt-5 text-lg leading-relaxed text-slate-600">
              KnowYourBrand brings together research, competitors, content, and performance in one workspace—powered by
              specialized AI agents that reason with your brief, your channels, and real market signals.
            </motion.p>
            <motion.div variants={heroItem} className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                to="/login"
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition hover:bg-indigo-700"
              >
                Sign in with Google
                <ArrowRight size={18} />
              </Link>
              <a
                href="#features"
                className="text-sm font-semibold text-indigo-700 underline-offset-4 hover:underline"
              >
                Explore capabilities
              </a>
            </motion.div>
            <motion.ul
              variants={heroItem}
              className="mt-10 grid gap-3 text-sm text-slate-600 sm:grid-cols-2"
            >
              {[
                "Market & competitor intelligence",
                "Cross-channel content & calendar",
                "Performance simulation & alerts",
              ].map((t) => (
                <li key={t} className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
                  {t}
                </li>
              ))}
            </motion.ul>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="relative"
          >
            <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-xl shadow-slate-900/5 ring-1 ring-slate-100">
              <img
                src="/assets/landing-hero.png"
                alt="Abstract visualization of brand analytics and AI-driven marketing workflows"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="pointer-events-none absolute -bottom-6 -right-6 hidden h-32 w-32 rounded-3xl bg-gradient-to-br from-indigo-500/20 to-teal-400/20 blur-2xl lg:block" />
          </motion.div>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold text-slate-900 sm:text-4xl">Built for modern marketing teams</h2>
          <p className="mt-4 text-slate-600">
            From first brief to published assets, KnowYourBrand keeps strategy, creative, and measurement connected—so
            every deliverable reflects what you learned yesterday and what you are testing tomorrow.
          </p>
        </div>

        <div className="mt-14 grid gap-10 lg:grid-cols-3">
          {[
            {
              title: "Insights you can brief from",
              body:
                "Synthesize positioning, audience tension, and channel fit from your site, social signals, and live research—then feed that context straight into campaign generation.",
              img: "/assets/landing-feature-analytics.png",
              alt: "Analytics and market insight illustration",
              icon: BarChart3,
            },
            {
              title: "Content across every surface",
              body:
                "Instagram, X, LinkedIn, email, WhatsApp, push, and video concepts in one pipeline—with schedules tuned to your calendar and channel norms.",
              img: "/assets/landing-feature-content.png",
              alt: "Multi-channel content planning illustration",
              icon: FileText,
            },
            {
              title: "Agents that collaborate",
              body:
                "Specialized agents for research, strategy, and creative work in parallel, with traceable steps, cited sources, and room to iterate before you ship.",
              img: "/assets/landing-feature-agents.png",
              alt: "AI agents collaborating illustration",
              icon: MessageSquare,
            },
          ].map((card, i) => {
            const Icon = card.icon;
            return (
            <motion.article
              key={card.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.08 }}
              className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:shadow-md"
            >
              <div className="aspect-[4/3] overflow-hidden bg-slate-50">
                <img src={card.img} alt={card.alt} className="h-full w-full object-cover" />
              </div>
              <div className="flex flex-1 flex-col p-6">
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <Icon size={20} />
                </div>
                <h3 className="font-display text-lg font-bold text-slate-900">{card.title}</h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-600">{card.body}</p>
              </div>
            </motion.article>
            );
          })}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="font-display text-2xl font-bold text-slate-900 sm:text-3xl">See impact before you spend</h2>
              <p className="mt-4 text-slate-600">
                Run performance simulations, compare channel mixes, and set alerts so your team reacts when markets move
                —without leaving the same workspace where your campaigns are authored.
              </p>
              <ul className="mt-8 space-y-4">
                {[
                  { icon: TrendingUp, text: "Scenario modeling for reach, engagement, and conversion assumptions" },
                  { icon: CalendarDays, text: "Unified calendar tying offline QR activations to digital follow-up" },
                  { icon: Sparkles, text: "Ask agents natural-language questions with campaign context baked in" },
                ].map((row) => {
                  const RowIcon = row.icon;
                  return (
                  <li key={row.text} className="flex gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                      <RowIcon size={18} />
                    </div>
                    <p className="text-sm leading-relaxed text-slate-600">{row.text}</p>
                  </li>
                  );
                })}
              </ul>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-indigo-50/80 to-teal-50/50 p-8 shadow-inner">
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">Why teams use KnowYourBrand</p>
              <p className="mt-4 text-lg font-semibold text-slate-900">
                One place for the story you tell the world—and the data that proves it is working.
              </p>
              <p className="mt-3 text-sm text-slate-600">
                Connect your Google account to get started. Your workspace is private; authentication is handled with
                industry-standard OAuth.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
                >
                  Sign in to begin
                  <ArrowRight size={16} />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-[#f4f6fb]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 py-12 sm:flex-row sm:px-6">
          <div className="flex items-center gap-3">
            <img src="/assets/logo-knowyourbrand.png" alt="" className="h-9 w-9 rounded-lg object-cover" />
            <div>
              <p className="font-display text-sm font-bold text-slate-900">KnowYourBrand</p>
              <p className="text-[11px] text-slate-500">© {new Date().getFullYear()} KnowYourBrand</p>
            </div>
          </div>
          <p className="max-w-md text-center text-xs text-slate-500 sm:text-right">
            AI-assisted marketing workflows. Always review outputs before publishing; you remain responsible for brand and
            compliance decisions.
          </p>
        </div>
      </footer>
    </div>
  );
}
