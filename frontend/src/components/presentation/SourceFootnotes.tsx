import { Link2 } from "lucide-react";
import type { SourceRef } from "../../lib/traceSources";

type Props = {
  sources: SourceRef[];
  className?: string;
  /** Sits flush under body text (tighter, lighter chrome). */
  variant?: "default" | "inline";
};

export function SourceFootnotes({ sources, className = "", variant = "default" }: Props) {
  if (!sources.length) return null;
  const inline = variant === "inline";
  return (
    <div
      className={
        inline
          ? `mt-3 pt-3 ${className}`
          : `mt-4 border-t border-slate-100 pt-3 ${className}`
      }
    >
      <p
        className={`mb-1.5 flex items-center gap-1.5 font-bold uppercase tracking-wide text-slate-400 ${
          inline ? "text-[9px]" : "mb-2 text-[10px]"
        }`}
      >
        <Link2 size={inline ? 10 : 12} className="shrink-0 text-indigo-400" />
        Sources
      </p>
      <ul className={`${inline ? "space-y-1" : "space-y-1.5"}`}>
        {sources.map((s) => (
          <li key={s.url} className={inline ? "text-[11px] leading-snug" : "text-xs"}>
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-indigo-600 hover:underline"
            >
              {s.title?.trim() || s.url}
            </a>
            {!inline && s.title?.trim() && (
              <span className="mt-0.5 block truncate text-[10px] text-slate-400">{s.url}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
