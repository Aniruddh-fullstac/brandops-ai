import type { ReactNode } from "react";
import { SourceFootnotes } from "./SourceFootnotes";
import type { SourceRef } from "../../lib/traceSources";

export function InsightSection({
  title,
  subtitle,
  icon: Icon,
  children,
  sources,
  accent = "indigo",
}: {
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  children: ReactNode;
  sources: SourceRef[];
  accent?: "indigo" | "teal" | "violet" | "amber";
}) {
  const bar =
    accent === "teal"
      ? "from-teal-500 to-emerald-400"
      : accent === "violet"
        ? "from-violet-500 to-fuchsia-500"
        : accent === "amber"
          ? "from-amber-500 to-orange-400"
          : "from-indigo-500 to-violet-500";

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm">
      <div className={`h-1 w-full bg-gradient-to-r ${bar}`} />
      <div className="p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${bar} text-white shadow-md`}>
            <Icon size={18} strokeWidth={1.75} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-display text-base font-bold text-slate-900">{title}</h3>
            {subtitle && <p className="mt-1 text-xs leading-relaxed text-slate-500">{subtitle}</p>}
          </div>
        </div>
        <div className="mt-5">{children}</div>
        <div className="mt-5 border-t border-slate-100 pt-4">
          <SourceFootnotes sources={sources} />
        </div>
      </div>
    </div>
  );
}
