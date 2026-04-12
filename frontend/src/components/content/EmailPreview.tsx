import { useState } from "react";
import {
  Archive,
  ArrowLeft,
  ChevronDown,
  ExternalLink,
  Forward,
  MapPin,
  MoreHorizontal,
  Reply,
  Star,
  Trash2,
} from "lucide-react";
import type { ScheduleRow } from "../../lib/contentSchedule";

function fmtEmailDate(iso: string | undefined): string {
  if (!iso) return "Today, 10:30 AM";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) +
      ", " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

interface EmailPreviewProps {
  row: ScheduleRow;
  brandName: string;
  brandHandle?: string;
  index: number;
}

export function EmailPreview({ row, brandName, brandHandle, index }: EmailPreviewProps) {
  const [starred, setStarred] = useState(false);
  const [headerExpanded, setHeaderExpanded] = useState(false);

  const emailAddr = `hello@${(brandHandle || brandName?.toLowerCase().replace(/\s+/g, "") || "brand")}.com`;
  const subject = row.email_subject || row.headline || "Exciting news from " + brandName;
  const preheader = row.email_preheader || "";
  const body = row.caption || row.whatsapp_message || "";
  const cta = row.cta || "Learn More";
  const images = (row.generated_image_urls || []).filter(Boolean);
  const when = fmtEmailDate(row.scheduled_at);
  const segment = row.target_segment;

  // Pixel ID for this email
  const pixelId = `px_${brandName?.slice(0, 3).toLowerCase() || "br"}_${index.toString().padStart(4, "0")}`;

  return (
    <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
      {/* Gmail-style toolbar */}
      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50/80 px-4 py-2.5">
        <button type="button" className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-slate-600 hover:bg-slate-200">
          <ArrowLeft size={16} />
          <span className="text-[12px] font-medium">Back</span>
        </button>
        <div className="mx-2 h-5 w-px bg-slate-300" />
        <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200">
          <Archive size={15} />
        </button>
        <button type="button" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200">
          <Trash2 size={15} />
        </button>
        <div className="flex-1" />
        <span className="text-[12px] text-slate-400">1 of 847</span>
      </div>

      {/* Subject */}
      <div className="border-b border-slate-100 px-6 pt-5 pb-3">
        <h1 className="text-xl font-bold text-slate-900">{subject}</h1>
        {preheader && (
          <p className="mt-1 text-[13px] text-slate-500 italic">{preheader}</p>
        )}
      </div>

      {/* Sender row */}
      <div className="flex items-start justify-between border-b border-slate-100 px-6 py-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 h-9 w-9 shrink-0 rounded-full bg-indigo-600 flex items-center justify-center text-sm font-bold text-white">
            {brandName?.[0]?.toUpperCase() || "B"}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[14px] font-semibold text-slate-900">{brandName}</span>
              <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">via ESP</span>
            </div>
            <button
              type="button"
              className="flex items-center gap-0.5 text-[12px] text-slate-500"
              onClick={() => setHeaderExpanded(v => !v)}
            >
              <span>to me</span>
              <ChevronDown size={12} className={`transition ${headerExpanded ? "rotate-180" : ""}`} />
            </button>
            {headerExpanded && (
              <div className="mt-1 rounded-lg border border-slate-100 bg-slate-50 p-2 text-[11px] text-slate-600 space-y-0.5">
                <p><span className="font-semibold">From:</span> {brandName} &lt;{emailAddr}&gt;</p>
                <p><span className="font-semibold">Reply-To:</span> {emailAddr}</p>
                {segment && <p><span className="font-semibold">Segment:</span> {segment}</p>}
                <p className="flex items-center gap-1"><MapPin size={10} /><span className="font-semibold">Geo-targeted:</span> Location-aware send time optimized</p>
                <p className="font-mono text-[10px] text-slate-400">Tracking pixel: {pixelId}</p>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-slate-500">
          <span className="text-[12px]">{when}</span>
          <button type="button" onClick={() => setStarred(v => !v)}>
            <Star size={16} className={starred ? "fill-yellow-400 text-yellow-400" : ""} strokeWidth={1.5} />
          </button>
          <Reply size={16} />
          <MoreHorizontal size={16} />
        </div>
      </div>

      {/* Email body */}
      <div className="bg-slate-50/40 px-6 py-6">
        <div className="mx-auto max-w-[560px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* Email header area */}
          <div className="flex items-center justify-center bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-8">
            <div className="text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-white/20">
                <span className="text-2xl font-bold text-white">{brandName?.[0]?.toUpperCase() || "B"}</span>
              </div>
              <p className="text-base font-bold text-white">{brandName}</p>
            </div>
          </div>

          {/* Hero image */}
          {images.length > 0 && (
            <img src={images[0]} alt="" className="w-full object-cover" style={{ maxHeight: 300 }} />
          )}

          {/* Body text */}
          <div className="px-8 py-6">
            {row.headline && (
              <h2 className="mb-3 text-xl font-bold text-slate-900">{row.headline}</h2>
            )}
            <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-slate-700">{body}</p>

            {/* CTA button */}
            <div className="mt-6 text-center">
              <a
                href="#"
                className="inline-block rounded-xl bg-indigo-600 px-8 py-3.5 text-[14px] font-bold text-white shadow-lg shadow-indigo-200 transition hover:bg-indigo-700"
                onClick={(e) => e.preventDefault()}
              >
                {cta}
              </a>
            </div>

            {/* Hashtags / keywords */}
            {Array.isArray(row.hashtags) && row.hashtags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {row.hashtags.map((t) => (
                  <span key={t} className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[11px] font-medium text-indigo-700">
                    {t.startsWith("#") ? t : `#${t}`}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-100 bg-slate-50 px-8 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-slate-400">© 2026 {brandName}. All rights reserved.</p>
              <div className="flex gap-3 text-[11px]">
                <button type="button" className="text-slate-400 hover:text-slate-700">Unsubscribe</button>
                <button type="button" className="text-slate-400 hover:text-slate-700">Privacy Policy</button>
                <button type="button" className="text-slate-400 hover:text-slate-700">
                  <ExternalLink size={10} className="inline mr-0.5" />View Online
                </button>
              </div>
            </div>

            {/* Hidden tracking pixel disclosure */}
            <div className="mt-3 rounded-lg border border-amber-100 bg-amber-50/60 px-3 py-2">
              <p className="text-[10px] font-mono text-amber-700">
                {`<!-- Hidden tracking pixel: ${pixelId} -->`}
                <br />
                {`<img src="https://track.${(brandHandle || brandName?.toLowerCase().replace(/\s+/g, "") || "brand")}.com/open/${pixelId}" width="1" height="1" style="display:none" />`}
              </p>
              {segment && (
                <div className="mt-1.5 flex items-center gap-1 text-[10px] text-amber-800">
                  <MapPin size={10} />
                  <span>Geo-personalized · Segment: {segment} · Send-time optimized</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick reply row */}
      <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-6 py-3">
        <button type="button" className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
          <Reply size={14} />Reply
        </button>
        <button type="button" className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-[12px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50">
          <Forward size={14} />Forward
        </button>
      </div>
    </div>
  );
}
