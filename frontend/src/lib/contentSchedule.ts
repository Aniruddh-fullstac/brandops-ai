/** Unified content schedule produced by backend `content_schedule` agent. */

export type ScheduleRow = {
  id?: string;
  scheduled_at?: string;
  platform?: string;
  headline?: string;
  caption?: string;
  hashtags?: string[];
  cta?: string;
  format?: string;
  image_needed?: boolean;
  image_prompt?: string | null;
  email_subject?: string | null;
  email_preheader?: string | null;
  whatsapp_message?: string | null;
  push_title?: string | null;
  push_body?: string | null;
  /** Audience segment this post is tailored for (when segment variants exist). */
  target_segment?: string | null;
};

export type ContentScheduleArtifact = {
  overview?: string;
  platforms?: Record<string, ScheduleRow[]>;
  timeline?: ScheduleRow[];
};

export const PLATFORM_ORDER = [
  "instagram",
  "linkedin",
  "twitter",
  "tiktok",
  "email",
  "whatsapp",
  "push_notification",
  "blog",
  "video",
] as const;

export const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  linkedin: "LinkedIn",
  twitter: "X (Twitter)",
  tiktok: "TikTok",
  email: "Email",
  whatsapp: "WhatsApp",
  push_notification: "Push notifications",
  blog: "Blog / SEO",
  video: "Video",
  seo: "SEO",
};

export function normalizePlatform(p: string | undefined): string {
  if (!p) return "other";
  return String(p).toLowerCase().trim().replace(/\s+/g, "_");
}

export function rowsFromArtifact(cs: ContentScheduleArtifact | undefined | null): ScheduleRow[] {
  if (!cs) return [];
  const tl = cs.timeline;
  if (Array.isArray(tl) && tl.length) return tl;
  const pl = cs.platforms;
  if (pl && typeof pl === "object") {
    const out: ScheduleRow[] = [];
    for (const [platform, rows] of Object.entries(pl)) {
      if (!Array.isArray(rows)) continue;
      for (const row of rows) {
        out.push({ ...row, platform: row.platform || platform });
      }
    }
    return out.sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)));
  }
  return [];
}

export function groupByPlatform(rows: ScheduleRow[]): Map<string, ScheduleRow[]> {
  const m = new Map<string, ScheduleRow[]>();
  for (const r of rows) {
    const k = normalizePlatform(r.platform);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(r);
  }
  return m;
}

export function filterRows(rows: ScheduleRow[], platform: string | "all"): ScheduleRow[] {
  if (platform === "all") return rows;
  return rows.filter((r) => normalizePlatform(r.platform) === normalizePlatform(platform));
}
