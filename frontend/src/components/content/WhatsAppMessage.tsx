import { useState } from "react";
import {
  Check,
  CheckCheck,
  Mic,
  Paperclip,
  Phone,
  Search,
  Smile,
  Video,
  MoreVertical,
  ChevronLeft,
  Camera,
} from "lucide-react";
import type { ScheduleRow } from "../../lib/contentSchedule";

function fmtWaTime(iso: string | undefined): string {
  if (!iso) return "10:30 AM";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "10:30 AM";
    return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "10:30 AM";
  }
}

interface WhatsAppMessageProps {
  row: ScheduleRow;
  brandName: string;
  index: number;
}

export function WhatsAppMessage({ row, brandName, index }: WhatsAppMessageProps) {
  const [read, setRead] = useState(false);
  const images = (row.generated_image_urls || []).filter(Boolean);
  const message = row.whatsapp_message || row.caption || row.headline || "";
  const time = fmtWaTime(row.scheduled_at);

  const ctaButtons: string[] = [];
  if (row.cta) ctaButtons.push(row.cta);

  return (
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl shadow-xl" style={{ fontFamily: "'SF Pro Text', sans-serif" }}>
      {/* WhatsApp header */}
      <div className="flex items-center gap-2 bg-[#075e54] px-3 py-3 text-white">
        <button type="button" className="text-white/80"><ChevronLeft size={22} /></button>
        <div className="h-9 w-9 overflow-hidden rounded-full bg-[#25d366]">
          <div className="flex h-full w-full items-center justify-center text-sm font-bold text-white">
            {brandName?.[0]?.toUpperCase() || "B"}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold leading-tight">{brandName}</p>
          <p className="text-[11px] text-white/70">Marketing · {row.target_segment || "All customers"}</p>
        </div>
        <div className="flex items-center gap-3 text-white/80">
          <Video size={20} />
          <Phone size={20} />
          <Search size={20} />
          <MoreVertical size={20} />
        </div>
      </div>

      {/* Chat background */}
      <div
        className="relative min-h-[400px] px-3 py-4"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Crect fill='%23e5ddd5' width='400' height='400'/%3E%3C/svg%3E")`,
          backgroundSize: "cover",
        }}
      >
        {/* Date badge */}
        <div className="mb-4 flex justify-center">
          <span className="rounded-full bg-white/80 px-3 py-1 text-[11px] font-medium text-slate-600 shadow-sm backdrop-blur-sm">
            {row.scheduled_at
              ? new Date(row.scheduled_at).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })
              : "Today"}
          </span>
        </div>

        {/* Business message bubble */}
        <div className="ml-0 mr-auto max-w-[85%]">
          <div className="relative overflow-hidden rounded-tr-xl rounded-b-xl bg-white shadow-md">
            {/* Business label bar */}
            <div className="bg-[#075e54]/10 px-3 py-1">
              <p className="text-[11px] font-bold text-[#075e54]">{brandName}</p>
            </div>

            {/* Image if any */}
            {images.length > 0 && (
              <div className="overflow-hidden">
                <img src={images[0]} alt="" className="w-full object-cover" style={{ maxHeight: 200 }} />
              </div>
            )}

            {/* Message text */}
            <div className="px-3 py-2">
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-900">{message}</p>
            </div>

            {/* CTA buttons */}
            {ctaButtons.length > 0 && (
              <div className="border-t border-slate-100">
                {ctaButtons.map((btn, i) => (
                  <button
                    key={i}
                    type="button"
                    className="block w-full border-b border-slate-100 py-2 text-center text-[13px] font-semibold text-[#00a884] last:border-0"
                  >
                    {btn}
                  </button>
                ))}
              </div>
            )}

            {/* Timestamp + read tick */}
            <div className="flex items-center justify-end gap-1 px-3 pb-2">
              <span className="text-[10px] text-slate-400">{time}</span>
              <button type="button" onClick={() => setRead(v => !v)}>
                {read ? (
                  <CheckCheck size={14} className="text-[#53bdeb]" />
                ) : (
                  <CheckCheck size={14} className="text-slate-400" />
                )}
              </button>
            </div>
          </div>

          {/* WhatsApp Business badge */}
          <div className="mt-1 flex items-center gap-1">
            <div className="h-3.5 w-3.5 rounded-full bg-[#25d366] flex items-center justify-center">
              <Check size={8} className="text-white" strokeWidth={3} />
            </div>
            <span className="text-[10px] text-slate-500">Business Account</span>
          </div>
        </div>

        {/* Hashtags as small tags */}
        {Array.isArray(row.hashtags) && row.hashtags.length > 0 && (
          <div className="ml-0 mr-auto mt-2 max-w-[85%]">
            <div className="flex flex-wrap gap-1 rounded-xl bg-white/70 px-3 py-2 shadow-sm backdrop-blur-sm">
              {row.hashtags.map((t) => (
                <span key={t} className="text-[11px] font-medium text-[#075e54]">
                  {t.startsWith("#") ? t : `#${t}`}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="flex items-center gap-2 bg-[#f0f0f0] px-3 py-2">
        <div className="flex flex-1 items-center gap-2 rounded-full bg-white px-4 py-2 shadow-sm">
          <Smile size={20} className="text-slate-400" />
          <span className="flex-1 text-[13px] text-slate-400">Type a message</span>
          <Paperclip size={18} className="text-slate-400" />
          <Camera size={18} className="text-slate-400" />
        </div>
        <button
          type="button"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-[#25d366] text-white shadow-md"
        >
          <Mic size={18} />
        </button>
      </div>

      {/* Tracking + location note */}
      <div className="bg-[#fff3cd] px-3 py-2">
        <p className="text-[10px] text-amber-800">
          📍 Location-targeted · Hidden tracking pixel · Opens tracked
          {row.target_segment ? ` · Segment: ${row.target_segment}` : ""}
        </p>
      </div>
    </div>
  );
}
