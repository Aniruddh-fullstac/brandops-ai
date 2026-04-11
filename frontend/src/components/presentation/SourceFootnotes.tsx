import { Link2 } from "lucide-react";
import type { SourceRef } from "../../lib/traceSources";

export function SourceFootnotes({ sources, className = "" }: { sources: SourceRef[]; className?: string }) {
  if (!sources.length) return null;
  return (
    <div className={`mt-4 border-t border-slate-100 pt-3 ${className}`}>
      <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-slate-400">
        <Link2 size={12} className="text-indigo-400" />
        Sources & citations
      </p>
      <ul className="space-y-1.5">
        {sources.map((s) => (
          <li key={s.url} className="text-xs">
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-indigo-600 hover:underline"
            >
              {s.title?.trim() || s.url}
            </a>
            {s.title?.trim() && <span className="mt-0.5 block truncate text-[10px] text-slate-400">{s.url}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
