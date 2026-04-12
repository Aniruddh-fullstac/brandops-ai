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
  /** URLs of images generated for this post (platform-sized). */
  generated_image_urls?: string[];
  /** Human-readable size label from the generator (e.g. "9:16 vertical"). */
  image_size_label?: string | null;
  /** OpenAI image size token when using DALL·E: 1024x1024 | 1024x1792 | 1792x1024 */
  image_generation_size?: string | null;
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
  youtube: "YouTube",
  email: "Email",
  whatsapp: "WhatsApp",
  push_notification: "Push notifications",
  blog: "Blog / SEO",
  video: "Video",
  seo: "SEO",
};

export function normalizePlatform(p: string | undefined): string {
  if (!p) return "other";
  const s = String(p).toLowerCase().trim().replace(/\s+/g, "_");
  if (s === "tiktok") return "video";
  return s;
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

/** Platform sections in a stable order (PLATFORM_ORDER, then any others). Rows sorted by scheduled_at. */
export function platformSectionsFromRows(rows: ScheduleRow[]): { platform: string; rows: ScheduleRow[] }[] {
  const m = groupByPlatform(rows);
  const order: string[] = [];
  for (const p of PLATFORM_ORDER) {
    const list = m.get(p);
    if (list && list.length) order.push(p);
  }
  for (const k of m.keys()) {
    if (!order.includes(k)) order.push(k);
  }
  return order.map((platform) => {
    const rs = [...(m.get(platform) || [])];
    rs.sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)));
    return { platform, rows: rs };
  });
}

/** Tailwind classes for post image previews (aligns with backend `dalle_size_and_label`). */
export function imagePreviewAspectClass(row: ScheduleRow): string {
  const size = row.image_generation_size;
  if (size === "1024x1792") return "aspect-[9/16] w-full max-h-[min(72vh,560px)]";
  if (size === "1792x1024") return "aspect-video w-full";
  const p = normalizePlatform(row.platform);
  if (p === "instagram" || p === "video" || p === "youtube") {
    return "aspect-[9/16] w-full max-h-[min(72vh,560px)]";
  }
  if (p === "linkedin" || p === "twitter" || p === "blog" || p === "seo") {
    return "aspect-video w-full";
  }
  return "aspect-square w-full";
}

export function filterRows(rows: ScheduleRow[], platform: string | "all"): ScheduleRow[] {
  if (platform === "all") return rows;
  return rows.filter((r) => normalizePlatform(r.platform) === normalizePlatform(platform));
}

/** ISO date (YYYY-MM-DD) or fallback label for grouping. */
export function dateKeyForRow(row: ScheduleRow): string {
  if (!row.scheduled_at) return "— Undated";
  try {
    const d = new Date(row.scheduled_at);
    if (Number.isNaN(d.getTime())) return String(row.scheduled_at).slice(0, 10) || "— Undated";
    return d.toISOString().slice(0, 10);
  } catch {
    return "— Undated";
  }
}

/** Calendar-first: each day contains platform sub-sections (same order as platform view). */
export function calendarSectionsFromRows(rows: ScheduleRow[]): {
  date: string;
  platformSections: { platform: string; rows: ScheduleRow[] }[];
}[] {
  const byDate = new Map<string, ScheduleRow[]>();
  for (const r of rows) {
    const k = dateKeyForRow(r);
    if (!byDate.has(k)) byDate.set(k, []);
    byDate.get(k)!.push(r);
  }
  const sorted = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  return sorted.map(([date, dateRows]) => ({
    date,
    platformSections: platformSectionsFromRows(dateRows),
  }));
}
