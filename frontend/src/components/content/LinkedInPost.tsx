import { useState } from "react";
import { Globe, MessageSquare, Repeat2, Send, ThumbsUp } from "lucide-react";
import type { ScheduleRow } from "../../lib/contentSchedule";

function fmtLinkedInTime(iso: string | undefined): string {
  if (!iso) return "1d • 🌐";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "1d • 🌐";
    const now = Date.now();
    const diff = Math.floor((now - d.getTime()) / 1000 / 60 / 60);
    if (diff < 24) return `${diff}h • 🌐`;
    return `${Math.floor(diff / 24)}d • 🌐`;
  } catch {
    return "1d • 🌐";
  }
}

const REACTIONS = [
  { emoji: "👍", label: "Like", color: "text-blue-600" },
  { emoji: "❤️", label: "Love" },
  { emoji: "🎉", label: "Celebrate" },
  { emoji: "💡", label: "Insightful" },
  { emoji: "👏", label: "Support" },
];

function mockLinkedInStats(i: number) {
  const seeds = [1247, 3891, 892, 5432, 2341];
  const base = seeds[i % seeds.length];
  return {
    reactions: base,
    comments: Math.floor(base / 12),
    reposts: Math.floor(base / 25),
  };
}

interface LinkedInPostProps {
  row: ScheduleRow;
  brandName: string;
  brandHandle?: string;
  index: number;
  followers?: number;
}

export function LinkedInPost({ row, brandName, brandHandle: _handle, index, followers }: LinkedInPostProps) {
  const [liked, setLiked] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const { reactions, comments, reposts } = mockLinkedInStats(index);
  const images = (row.generated_image_urls || []).filter(Boolean);
  const tags = Array.isArray(row.hashtags) ? row.hashtags : [];
  const caption = row.caption || row.headline || "";
  const displayCaption =
    !expanded && caption.length > 280 ? caption.slice(0, 280) : caption;
  const when = fmtLinkedInTime(row.scheduled_at);
  const fmtFollowers = followers
    ? followers >= 1000 ? `${(followers / 1000).toFixed(1)}K followers` : `${followers} followers`
    : "12.5K followers";

  return (
    <div className="mx-auto w-full max-w-[600px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
      {/* Header */}
      <div className="flex items-start gap-3 px-4 pt-4">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-blue-700">
          <div className="flex h-full w-full items-center justify-center text-lg font-bold text-white">
            {brandName?.[0]?.toUpperCase() || "B"}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">{brandName}</p>
          <p className="text-[13px] text-slate-500">
            {fmtFollowers} · <span className="font-medium text-blue-700">Sponsored</span>
          </p>
          <div className="mt-0.5 flex items-center gap-1 text-[12px] text-slate-400">
            <Globe size={12} />
            <span>{when}</span>
          </div>
        </div>
        <button
          type="button"
          className="rounded-full border border-blue-600 px-4 py-1.5 text-[13px] font-semibold text-blue-700 hover:bg-blue-50"
        >
          + Follow
        </button>
      </div>

      {/* Headline */}
      {row.headline && (
        <h3 className="px-4 pt-3 text-[15px] font-bold text-slate-900">{row.headline}</h3>
      )}

      {/* Caption */}
      <div className="px-4 pt-2">
        <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-slate-800">{displayCaption}</p>
        {caption.length > 280 && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 text-[13px] font-semibold text-slate-500 hover:text-slate-800"
          >
            {expanded ? "…see less" : "…see more"}
          </button>
        )}
      </div>

      {/* Hashtags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 px-4 py-1">
          {tags.map((t) => (
            <span key={t} className="text-[13px] font-medium text-blue-600 hover:underline">
              {t.startsWith("#") ? t : `#${t}`}
            </span>
          ))}
        </div>
      )}

      {/* Image */}
      {images.length > 0 && (
        <div className="mt-2 overflow-hidden">
          <div
            className={
              images.length > 1
                ? "grid grid-cols-2 gap-0.5"
                : "aspect-video"
            }
          >
            {images.slice(0, 4).map((src, i) => (
              <img
                key={src + i}
                src={src}
                alt=""
                className={`w-full object-cover ${images.length === 1 ? "h-full" : "aspect-video"}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Reaction bar */}
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-1">
          <div className="flex">
            {REACTIONS.slice(0, 3).map((r) => (
              <span key={r.label} className="-ml-0.5 first:ml-0 text-base">{r.emoji}</span>
            ))}
          </div>
          <span className="ml-1 text-[13px] text-slate-500">
            {(liked ? reactions + 1 : reactions).toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[13px] text-slate-500">
          <span>{comments} comments</span>
          <span>{reposts} reposts</span>
        </div>
      </div>

      {/* Action row */}
      <div className="flex items-center justify-around border-t border-slate-100 px-2 py-1">
        {[
          { icon: <ThumbsUp size={18} className={liked ? "fill-blue-600 text-blue-600" : ""} strokeWidth={1.5} />, label: "Like", action: () => setLiked(v => !v), active: liked },
          { icon: <MessageSquare size={18} strokeWidth={1.5} />, label: "Comment", action: () => {}, active: false },
          { icon: <Repeat2 size={18} strokeWidth={1.5} />, label: "Repost", action: () => {}, active: false },
          { icon: <Send size={18} strokeWidth={1.5} />, label: "Send", action: () => {}, active: false },
        ].map(({ icon, label, action, active }) => (
          <button
            key={label}
            type="button"
            onClick={action}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[13px] font-semibold transition hover:bg-slate-50 ${
              active ? "text-blue-700" : "text-slate-600"
            }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* CTA */}
      {row.cta && (
        <div className="border-t border-slate-100 bg-blue-50/50 px-4 py-2">
          <p className="text-[12px] font-semibold text-blue-800">{row.cta}</p>
        </div>
      )}

      {row.target_segment && (
        <div className="border-t border-slate-100 px-4 py-2">
          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-blue-700">
            Audience: {row.target_segment}
          </span>
        </div>
      )}
    </div>
  );
}
