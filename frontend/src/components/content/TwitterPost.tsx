import { useState } from "react";
import { BarChart2, Heart, MessageCircle, Repeat2, Upload } from "lucide-react";
import type { ScheduleRow } from "../../lib/contentSchedule";

function fmtTweetTime(iso: string | undefined): string {
  if (!iso) return "Not scheduled";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "Not scheduled";
    return (
      d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) +
      " · " +
      d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" })
    );
  } catch {
    return "Not scheduled";
  }
}

function mockTweetStats(index: number) {
  const seeds = [234, 1847, 562, 3291, 891, 4523, 1122, 673, 2987, 445];
  const base = seeds[index % seeds.length];
  return {
    replies: Math.floor(base / 10),
    retweets: Math.floor(base / 4),
    likes: base + index * 91,
    views: (base * 8 + index * 340).toLocaleString() + "K",
  };
}

interface TwitterPostProps {
  row: ScheduleRow;
  brandName: string;
  brandHandle?: string;
  index: number;
  campaignImageFallback?: string | null;
}

export function TwitterPost({ row, brandName, brandHandle, index, campaignImageFallback }: TwitterPostProps) {
  const [liked, setLiked] = useState(false);
  const [retweeted, setRetweeted] = useState(false);

  const handle = (brandHandle || brandName?.toLowerCase().replace(/\s+/g, "") || "brand").replace("@", "");
  const { replies, retweets, likes, views } = mockTweetStats(index);
  const rawGen = (row.generated_image_urls || []).filter(Boolean);
  const images = rawGen.length > 0 ? rawGen : campaignImageFallback ? [campaignImageFallback] : [];
  const tags = Array.isArray(row.hashtags) ? row.hashtags : [];
  const caption = row.caption || row.headline || "";
  const when = fmtTweetTime(row.scheduled_at);

  const hasImage = images.length > 0;

  return (
    <div className="mx-auto w-full max-w-[600px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
      {/* Header */}
      <div className="flex items-start gap-3 px-4 pt-4">
        {/* Avatar */}
        <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-slate-900">
          <div className="flex h-full w-full items-center justify-center text-sm font-bold text-white">
            {brandName?.[0]?.toUpperCase() || "B"}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="text-[15px] font-bold text-slate-900">{brandName}</span>
            {/* Blue checkmark */}
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-blue-500" aria-label="Verified">
              <path d="M22.25 12c0-1.43-.88-2.67-2.19-3.34.46-1.39.2-2.9-.81-3.91s-2.52-1.27-3.91-.81c-.66-1.31-1.91-2.19-3.34-2.19s-2.67.88-3.33 2.19c-1.4-.46-2.91-.2-3.92.81s-1.26 2.52-.8 3.91C2.88 9.33 2 10.57 2 12s.88 2.67 2.19 3.34c-.46 1.39-.2 2.9.81 3.91s2.52 1.27 3.91.81c.66 1.31 1.91 2.19 3.34 2.19s2.67-.88 3.33-2.19c1.4.46 2.91.2 3.92-.81s1.26-2.52.8-3.91C21.36 14.67 22.25 13.43 22.25 12zm-13.06 4.27l-3.93-3.93 1.06-1.06 2.87 2.87 6.43-6.43 1.06 1.06-7.49 7.49z" />
            </svg>
            <span className="text-[14px] text-slate-500">@{handle}</span>
          </div>
        </div>
        {/* X logo */}
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-slate-900" aria-label="X">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.63zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      </div>

      {/* Body */}
      <div className="px-4 pt-2">
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-slate-900">{caption}</p>
        {tags.length > 0 && (
          <p className="mt-1 text-[15px] font-medium text-blue-500">
            {tags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ")}
          </p>
        )}
      </div>

      {/* Image */}
      {hasImage && (
        <div className="mt-3 px-4">
          <div
            className={`overflow-hidden rounded-2xl border border-slate-200 ${
              images.length > 1 ? "grid grid-cols-2 gap-0.5" : "aspect-video"
            }`}
          >
            {images.slice(0, 4).map((src, i) => (
              <img
                key={src + i}
                src={src}
                alt=""
                className={`w-full object-cover ${images.length === 1 ? "h-full" : "aspect-square"}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Timestamp */}
      <div className="px-4 py-2.5">
        <span className="text-[14px] text-slate-500">{when}</span>
        {row.target_segment && (
          <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            {row.target_segment}
          </span>
        )}
      </div>

      {/* Views bar */}
      <div className="border-t border-slate-100 px-4 py-2">
        <p className="text-[14px] text-slate-500">
          <span className="font-semibold text-slate-900">{views}</span> Views
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
        <button type="button" className="group flex items-center gap-2 text-slate-500 hover:text-blue-500">
          <MessageCircle size={18} strokeWidth={1.5} className="transition group-hover:scale-110" />
          <span className="text-[13px]">{replies}</span>
        </button>
        <button
          type="button"
          onClick={() => setRetweeted((v) => !v)}
          className={`group flex items-center gap-2 ${retweeted ? "text-green-500" : "text-slate-500 hover:text-green-500"}`}
        >
          <Repeat2 size={18} strokeWidth={1.5} className="transition group-hover:scale-110" />
          <span className="text-[13px]">{retweeted ? retweets + 1 : retweets}</span>
        </button>
        <button
          type="button"
          onClick={() => setLiked((v) => !v)}
          className={`group flex items-center gap-2 ${liked ? "text-pink-500" : "text-slate-500 hover:text-pink-500"}`}
        >
          <Heart
            size={18}
            strokeWidth={liked ? 0 : 1.5}
            className={`transition group-hover:scale-110 ${liked ? "fill-pink-500" : ""}`}
          />
          <span className="text-[13px]">{liked ? likes + 1 : likes}</span>
        </button>
        <button type="button" className="text-slate-500 hover:text-blue-500">
          <BarChart2 size={18} strokeWidth={1.5} />
        </button>
        <button type="button" className="text-slate-500 hover:text-blue-500">
          <Upload size={18} strokeWidth={1.5} />
        </button>
      </div>

      {/* CTA */}
      {row.cta && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-2">
          <p className="text-[12px] font-semibold text-blue-700">{row.cta}</p>
        </div>
      )}
    </div>
  );
}
