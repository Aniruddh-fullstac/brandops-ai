import { Calendar, Hash, ImageIcon, Megaphone } from "lucide-react";
import type { ScheduleRow } from "../../lib/contentSchedule";
import { PLATFORM_LABEL, normalizePlatform } from "../../lib/contentSchedule";

const BADGE: Record<string, string> = {
  instagram: "bg-pink-100 text-pink-800 border-pink-200",
  linkedin: "bg-blue-100 text-blue-800 border-blue-200",
  twitter: "bg-slate-800 text-white border-slate-700",
  tiktok: "bg-violet-100 text-violet-900 border-violet-200",
  email: "bg-amber-100 text-amber-900 border-amber-200",
  whatsapp: "bg-green-100 text-green-900 border-green-200",
  push_notification: "bg-orange-100 text-orange-900 border-orange-200",
  blog: "bg-emerald-100 text-emerald-900 border-emerald-200",
  video: "bg-rose-100 text-rose-900 border-rose-200",
  seo: "bg-cyan-100 text-cyan-900 border-cyan-200",
  other: "bg-slate-100 text-slate-800 border-slate-200",
};

function fmtWhen(iso: string | undefined): { date: string; time: string } {
  if (!iso) return { date: "—", time: "" };
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return { date: iso, time: "" };
    return {
      date: d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
      time: d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }),
    };
  } catch {
    return { date: iso, time: "" };
  }
}

export function ScheduleItemCard({ row, compact }: { row: ScheduleRow; compact?: boolean }) {
  const p = normalizePlatform(row.platform);
  const badge = BADGE[p] || BADGE.other;
  const label = PLATFORM_LABEL[p] || p.replace(/_/g, " ");
  const when = fmtWhen(row.scheduled_at);
  const tags = Array.isArray(row.hashtags) ? row.hashtags : [];

  return (
    <article
      className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${compact ? "p-4" : "p-5"}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase ${badge}`}>{label}</span>
          {row.format && (
            <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">{row.format}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Calendar size={14} className="text-indigo-400" />
          <span className="font-medium text-slate-700">{when.date}</span>
          {when.time && <span className="text-slate-400">{when.time}</span>}
        </div>
      </div>

      {row.headline && <h3 className={`mt-3 font-display font-semibold text-slate-900 ${compact ? "text-sm" : "text-base"}`}>{row.headline}</h3>}

      {row.caption && (
        <p className={`mt-2 whitespace-pre-wrap text-slate-700 ${compact ? "text-xs leading-relaxed" : "text-sm leading-relaxed"}`}>
          {row.caption}
        </p>
      )}

      {p === "email" && (row.email_subject || row.email_preheader) && (
        <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50/50 p-3 text-sm">
          {row.email_subject && (
            <p>
              <span className="font-semibold text-amber-900">Subject: </span>
              {row.email_subject}
            </p>
          )}
          {row.email_preheader && (
            <p className="mt-1 text-xs text-amber-800/90">
              <span className="font-semibold">Preheader: </span>
              {row.email_preheader}
            </p>
          )}
        </div>
      )}

      {p === "whatsapp" && row.whatsapp_message && (
        <div className="mt-3 rounded-xl border border-green-100 bg-green-50/60 p-3 text-sm text-green-950">
          <p className="text-[10px] font-bold uppercase text-green-700">WhatsApp</p>
          <p className="mt-1 whitespace-pre-wrap">{row.whatsapp_message}</p>
        </div>
      )}

      {p === "push_notification" && (row.push_title || row.push_body) && (
        <div className="mt-3 rounded-xl border border-orange-100 bg-orange-50/60 p-3 text-sm">
          {row.push_title && <p className="font-semibold text-orange-950">{row.push_title}</p>}
          {row.push_body && <p className="mt-1 text-orange-900/90">{row.push_body}</p>}
        </div>
      )}

      {tags.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <Hash size={14} className="text-indigo-400" />
          {tags.map((t) => (
            <span key={t} className="rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-800">
              {t.startsWith("#") ? t : `#${t}`}
            </span>
          ))}
        </div>
      )}

      {row.cta && (
        <p className="mt-3 flex items-start gap-2 text-xs text-slate-600">
          <Megaphone size={14} className="mt-0.5 shrink-0 text-teal-500" />
          <span><strong className="text-slate-800">CTA:</strong> {row.cta}</span>
        </p>
      )}

      {row.image_needed && row.image_prompt && (
        <div className="mt-3 flex gap-2 rounded-lg border border-violet-100 bg-violet-50/50 p-2 text-xs text-violet-900">
          <ImageIcon size={16} className="shrink-0 text-violet-500" />
          <div>
            <span className="font-semibold">Suggested visual — </span>
            {row.image_prompt}
          </div>
        </div>
      )}
    </article>
  );
}
