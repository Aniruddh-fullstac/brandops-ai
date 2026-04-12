import { useState } from "react";
import {
  Bookmark,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Send,
  MapPin,
} from "lucide-react";
import type { ScheduleRow } from "../../lib/contentSchedule";

/** Full local date + time for scheduled posts */
function formatScheduledDateTime(iso: string | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

function mockEngagement(i: number) {
  const seeds = [1247, 3891, 892, 5432, 2341, 7812, 4211, 983, 6127, 1534];
  const base = seeds[i % seeds.length];
  return {
    likes: base + Math.floor(i * 137),
    comments: Math.floor(base / 14) + i * 3,
  };
}

interface InstagramPostProps {
  row: ScheduleRow;
  brandName: string;
  brandHandle?: string;
  index: number;
  /** When the row has no `generated_image_urls`, show this campaign asset (same pool as “Campaign visuals”). */
  campaignImageFallback?: string | null;
}

export function InstagramPost({ row, brandName, brandHandle, index, campaignImageFallback }: InstagramPostProps) {
  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [imgIdx, setImgIdx] = useState(0);

  const rawGen = (row.generated_image_urls || []).filter(Boolean);
  const images =
    rawGen.length > 0 ? rawGen : campaignImageFallback ? [campaignImageFallback] : [];
  const tags = Array.isArray(row.hashtags) ? row.hashtags : [];
  const handle = (brandHandle || brandName?.toLowerCase().replace(/\s+/g, "") || "brand").replace("@", "");
  const { likes, comments } = mockEngagement(index);
  const displayLikes = liked ? likes + 1 : likes;
  const scheduledLabel = formatScheduledDateTime(row.scheduled_at);
  const location = row.target_segment ? `${row.target_segment}` : undefined;

  const caption = row.caption || row.headline || "";
  const displayCaption =
    caption.length > 200 ? caption.slice(0, 200) + "… more" : caption;

  return (
    <div className="mx-auto w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-3.5 py-3">
        <div className="flex items-center gap-2.5">
          {/* Avatar ring */}
          <div className="relative">
            <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-yellow-400 via-red-500 to-purple-600 p-0.5">
              <div className="flex h-full w-full items-center justify-center rounded-full bg-slate-900 text-[10px] font-bold text-white">
                {brandName?.[0]?.toUpperCase() || "B"}
              </div>
            </div>
          </div>
          <div>
            <p className="text-[13px] font-semibold leading-tight text-slate-900">{handle}</p>
            {scheduledLabel ? (
              <p className="mt-0.5 flex items-center gap-1 text-[10px] font-medium text-slate-600">
                <CalendarClock size={11} className="shrink-0 text-indigo-500" />
                <span>{scheduledLabel}</span>
              </p>
            ) : (
              <p className="mt-0.5 text-[10px] text-slate-400">No publish time on this row</p>
            )}
            {location && (
              <p className="flex items-center gap-0.5 text-[10px] text-slate-500">
                <MapPin size={9} />
                {location}
              </p>
            )}
          </div>
        </div>
        <MoreHorizontal size={20} className="text-slate-600" />
      </div>

      {/* Image / carousel */}
      {images.length > 0 ? (
        <div className="relative bg-slate-100">
          <div className="relative aspect-square overflow-hidden">
            <img
              src={images[imgIdx]}
              alt={`Post ${imgIdx + 1}`}
              className="h-full w-full object-cover"
            />
            {images.length > 1 && (
              <>
                {imgIdx > 0 && (
                  <button
                    type="button"
                    onClick={() => setImgIdx((n) => n - 1)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1 shadow-md backdrop-blur-sm"
                  >
                    <ChevronLeft size={16} className="text-slate-800" />
                  </button>
                )}
                {imgIdx < images.length - 1 && (
                  <button
                    type="button"
                    onClick={() => setImgIdx((n) => n + 1)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-white/80 p-1 shadow-md backdrop-blur-sm"
                  >
                    <ChevronRight size={16} className="text-slate-800" />
                  </button>
                )}
                {/* Carousel dots */}
                <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1">
                  {images.map((_, di) => (
                    <button
                      key={di}
                      type="button"
                      onClick={() => setImgIdx(di)}
                      className={`h-1.5 rounded-full transition-all ${
                        di === imgIdx ? "w-4 bg-blue-500" : "w-1.5 bg-white/70"
                      }`}
                    />
                  ))}
                </div>
                {/* Slide counter */}
                <div className="absolute right-3 top-3 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                  {imgIdx + 1}/{images.length}
                </div>
              </>
            )}
          </div>
        </div>
      ) : row.image_needed || row.image_prompt ? (
        <div className="flex aspect-square flex-col items-center justify-center gap-2 bg-gradient-to-br from-slate-100 to-slate-200 px-6 text-center">
          <div className="rounded-xl border border-violet-200 bg-violet-50/80 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-700">Suggested Visual</p>
            <p className="mt-1.5 text-xs leading-relaxed text-violet-900/90">{row.image_prompt}</p>
          </div>
        </div>
      ) : null}

      {/* Actions */}
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setLiked((v) => !v)}
            className="flex items-center gap-1"
          >
            <Heart
              size={24}
              className={liked ? "fill-red-500 text-red-500" : "text-slate-800"}
              strokeWidth={liked ? 0 : 1.5}
            />
          </button>
          <MessageCircle size={24} className="text-slate-800" strokeWidth={1.5} />
          <Send size={22} className="text-slate-800 -rotate-12" strokeWidth={1.5} />
        </div>
        <button type="button" onClick={() => setSaved((v) => !v)}>
          <Bookmark
            size={22}
            className={saved ? "fill-slate-800 text-slate-800" : "text-slate-800"}
            strokeWidth={1.5}
          />
        </button>
      </div>

      {/* Likes */}
      <div className="px-3.5">
        <p className="text-[13px] font-semibold text-slate-900">
          {displayLikes.toLocaleString()} likes
        </p>
      </div>

      {/* Caption */}
      <div className="px-3.5 pb-1 pt-1">
        <p className="text-[13px] leading-snug text-slate-900">
          <span className="font-semibold">{handle}</span>{" "}
          <span className="whitespace-pre-wrap">{displayCaption}</span>
        </p>
        {tags.length > 0 && (
          <p className="mt-1 text-[12px] font-medium text-blue-600">
            {tags.map((t) => (t.startsWith("#") ? t : `#${t}`)).join(" ")}
          </p>
        )}
      </div>

      {/* Comments line */}
      <div className="px-3.5 py-1">
        <button type="button" className="text-[12px] text-slate-500">
          View all {comments.toLocaleString()} comments
        </button>
      </div>

      {/* CTA */}
      {row.cta && (
        <div className="mx-3.5 mb-2 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-1.5">
          <p className="text-[11px] font-semibold text-blue-800">{row.cta}</p>
        </div>
      )}

      {/* Post format */}
      <div className="flex items-center justify-end border-t border-slate-100 px-3.5 py-2">
        {row.format && (
          <span className="rounded-md bg-pink-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-pink-700">
            {row.format}
          </span>
        )}
      </div>
    </div>
  );
}
