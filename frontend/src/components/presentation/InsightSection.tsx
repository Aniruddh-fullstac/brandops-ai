import type { ReactNode } from "react";
import { SourceFootnotes } from "./SourceFootnotes";
import type { SourceRef } from "../../lib/traceSources";

export function InsightSection({
  title,
  icon: Icon,
  children,
  sources,
}: {
  title: string;
  icon: React.ElementType;
  children: ReactNode;
  sources: SourceRef[];
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <Icon size={18} className="text-indigo-600" />
        <h3 className="font-display text-base font-semibold text-slate-900">{title}</h3>
      </div>
      <div className="mt-4">{children}</div>
      <SourceFootnotes sources={sources} />
    </div>
  );
}
