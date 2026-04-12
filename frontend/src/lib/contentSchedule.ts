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
  /** Aspect hint token from backend (matches Pix prompt buckets): 1024x1024 | 1024x1792 | 1792x1024 */
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
  if (s === "tiktok" || s === "youtube" || s === "yt" || s === "shorts") return "video";
  if (s === "x" || s === "x_twitter") return "twitter";
  // LLM sometimes uses "seo" as its own platform; treat like blog for schedule UI.
  if (s === "seo") return "blog";
  return s;
}

/** Accept Firestore/API payloads where `content_schedule` was stringified. */
export function parseContentSchedule(raw: unknown): ContentScheduleArtifact | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      const p = JSON.parse(raw) as unknown;
      return p && typeof p === "object" ? (p as ContentScheduleArtifact) : null;
    } catch {
      return null;
    }
  }
  if (typeof raw === "object") return raw as ContentScheduleArtifact;
  return null;
}

function flattenPlatformRows(pl: ContentScheduleArtifact["platforms"]): ScheduleRow[] {
  if (!pl || typeof pl !== "object") return [];
  const out: ScheduleRow[] = [];
  for (const [platform, rows] of Object.entries(pl)) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (row != null && typeof row === "object" && !Array.isArray(row)) {
        const r = row as ScheduleRow;
        out.push({ ...r, platform: r.platform || platform });
      }
    }
  }
  return out;
}

function isScheduleRowLike(x: unknown): x is ScheduleRow {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

/**
 * Builds schedule rows the same way the backend image pipeline does: prefer `timeline`,
 * but merge with `platforms` so rows missing `platform` on the timeline still match a channel.
 */
export function rowsFromArtifact(cs: ContentScheduleArtifact | undefined | null): ScheduleRow[] {
  if (!cs) return [];
  const fromPl = flattenPlatformRows(cs.platforms);
  const tl = cs.timeline;
  const fromTl = Array.isArray(tl) ? tl.filter(isScheduleRowLike) : [];

  if (fromTl.length === 0) {
    return fromPl.sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)));
  }

  if (fromPl.length === 0) {
    return fromTl.sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)));
  }

  const plById = new Map<string, ScheduleRow>();
  for (const r of fromPl) {
    const id = String(r.id ?? "").trim();
    if (id) plById.set(id, r);
  }

  const seen = new Set<string>();
  const merged: ScheduleRow[] = [];

  for (const r of fromTl) {
    const id = String(r.id ?? "").trim();
    const plRow = id ? plById.get(id) : undefined;
    const combined: ScheduleRow = {
      ...(plRow || {}),
      ...r,
      platform: r.platform || plRow?.platform,
    };
    merged.push(combined);
    if (id) seen.add(id);
  }

  for (const r of fromPl) {
    const id = String(r.id ?? "").trim();
    if (id && !seen.has(id)) {
      merged.push(r);
      seen.add(id);
    }
  }

  return merged.sort((a, b) => String(a.scheduled_at).localeCompare(String(b.scheduled_at)));
}

/**
 * When `content_schedule` is missing or empty but the creative bundle exists (common after partial saves),
 * derive display rows from `creatives` / `refined_creatives` so Content Studio tabs still show copy.
 */
export function rowsFromCreativesFallback(bundle: Record<string, unknown> | null | undefined): ScheduleRow[] {
  if (!bundle || typeof bundle !== "object") return [];
  const social = bundle.social as Record<string, unknown> | undefined;
  const msg = bundle.messaging_whatsapp as Record<string, unknown> | undefined;
  const rows: ScheduleRow[] = [];
  let n = 0;

  if (social && typeof social === "object") {
    const ig = social.instagram;
    if (Array.isArray(ig)) {
      for (const item of ig) {
        if (!item || typeof item !== "object") continue;
        const o = item as Record<string, unknown>;
        rows.push({
          id: `creative_ig_${n++}`,
          platform: "instagram",
          headline: typeof o.idea === "string" ? o.idea : undefined,
          caption: typeof o.caption === "string" ? o.caption : undefined,
          hashtags: Array.isArray(o.hashtags) ? (o.hashtags as string[]) : undefined,
          format: typeof o.format === "string" ? o.format : undefined,
        });
      }
    }

    const li = social.linkedin;
    if (Array.isArray(li)) {
      for (const item of li) {
        if (!item || typeof item !== "object") continue;
        const o = item as Record<string, unknown>;
        const hook = typeof o.hook === "string" ? o.hook : "";
        const body = typeof o.body === "string" ? o.body : "";
        rows.push({
          id: `creative_li_${n++}`,
          platform: "linkedin",
          headline: hook || undefined,
          caption: [hook, body].filter(Boolean).join("\n\n") || undefined,
          cta: typeof o.cta === "string" ? o.cta : undefined,
        });
      }
    }

    const tw = social.twitter;
    if (Array.isArray(tw)) {
      for (const item of tw) {
        if (!item || typeof item !== "object") continue;
        const o = item as Record<string, unknown>;
        rows.push({
          id: `creative_tw_${n++}`,
          platform: "twitter",
          caption: typeof o.text === "string" ? o.text : undefined,
          hashtags: Array.isArray(o.hashtags) ? (o.hashtags as string[]) : undefined,
        });
      }
    }

    const emails = social.email_broadcasts;
    if (Array.isArray(emails)) {
      for (const item of emails) {
        if (!item || typeof item !== "object") continue;
        const o = item as Record<string, unknown>;
        rows.push({
          id: `creative_em_${n++}`,
          platform: "email",
          headline: typeof o.subject === "string" ? o.subject : undefined,
          caption: typeof o.body === "string" ? o.body : undefined,
          email_subject: typeof o.subject === "string" ? o.subject : null,
          email_preheader: typeof o.preheader === "string" ? o.preheader : null,
        });
      }
    }

    const pushes = social.push_notifications;
    if (Array.isArray(pushes)) {
      for (const item of pushes) {
        if (!item || typeof item !== "object") continue;
        const o = item as Record<string, unknown>;
        rows.push({
          id: `creative_pn_${n++}`,
          platform: "push_notification",
          push_title: typeof o.title === "string" ? o.title : null,
          push_body: typeof o.body === "string" ? o.body : null,
          caption: typeof o.body === "string" ? o.body : undefined,
        });
      }
    }

    const reels = social.reels_short_form;
    if (Array.isArray(reels)) {
      for (const item of reels) {
        if (!item || typeof item !== "object") continue;
        const o = item as Record<string, unknown>;
        const hook = typeof o.hook === "string" ? o.hook : "";
        const beats =
          typeof o.beat_sheet === "string"
            ? o.beat_sheet
            : o.beat_sheet != null
              ? JSON.stringify(o.beat_sheet)
              : "";
        rows.push({
          id: `creative_vid_${n++}`,
          platform: "video",
          headline: hook || "Short-form video",
          caption: [hook, beats].filter(Boolean).join("\n\n") || undefined,
        });
      }
    }

    const segVar = social.segment_variants;
    if (Array.isArray(segVar)) {
      for (const seg of segVar) {
        if (!seg || typeof seg !== "object") continue;
        const s = seg as Record<string, unknown>;
        const segName = typeof s.segment_name === "string" ? s.segment_name : undefined;
        const igS = s.instagram;
        if (Array.isArray(igS)) {
          for (const item of igS) {
            if (!item || typeof item !== "object") continue;
            const o = item as Record<string, unknown>;
            rows.push({
              id: `creative_ig_seg_${n++}`,
              platform: "instagram",
              target_segment: segName ?? null,
              headline: typeof o.idea === "string" ? o.idea : undefined,
              caption: typeof o.caption === "string" ? o.caption : undefined,
              hashtags: Array.isArray(o.hashtags) ? (o.hashtags as string[]) : undefined,
              format: typeof o.format === "string" ? o.format : undefined,
            });
          }
        }
        const liS = s.linkedin;
        if (Array.isArray(liS)) {
          for (const item of liS) {
            if (!item || typeof item !== "object") continue;
            const o = item as Record<string, unknown>;
            const hook = typeof o.hook === "string" ? o.hook : "";
            const body = typeof o.body === "string" ? o.body : "";
            rows.push({
              id: `creative_li_seg_${n++}`,
              platform: "linkedin",
              target_segment: segName ?? null,
              headline: hook || undefined,
              caption: [hook, body].filter(Boolean).join("\n\n") || undefined,
              cta: typeof o.cta === "string" ? o.cta : undefined,
            });
          }
        }
        const twS = s.twitter;
        if (Array.isArray(twS)) {
          for (const item of twS) {
            if (!item || typeof item !== "object") continue;
            const o = item as Record<string, unknown>;
            rows.push({
              id: `creative_tw_seg_${n++}`,
              platform: "twitter",
              target_segment: segName ?? null,
              caption: typeof o.text === "string" ? o.text : undefined,
              hashtags: Array.isArray(o.hashtags) ? (o.hashtags as string[]) : undefined,
            });
          }
        }
        const rsS = s.reels_short_form;
        if (Array.isArray(rsS)) {
          for (const item of rsS) {
            if (!item || typeof item !== "object") continue;
            const o = item as Record<string, unknown>;
            const hook = typeof o.hook === "string" ? o.hook : "";
            const beats =
              typeof o.beat_sheet === "string"
                ? o.beat_sheet
                : o.beat_sheet != null
                  ? JSON.stringify(o.beat_sheet)
                  : "";
            rows.push({
              id: `creative_vid_seg_${n++}`,
              platform: "video",
              target_segment: segName ?? null,
              headline: hook || "Short-form video",
              caption: [hook, beats].filter(Boolean).join("\n\n") || undefined,
            });
          }
        }
      }
    }
  }

  if (msg && typeof msg === "object") {
    const seqs = msg.whatsapp_sequences;
    if (Array.isArray(seqs)) {
      for (const seq of seqs) {
        if (!seq || typeof seq !== "object") continue;
        const s = seq as Record<string, unknown>;
        const name = typeof s.name === "string" ? s.name : "Sequence";
        const messages = s.messages;
        if (!Array.isArray(messages)) continue;
        for (const m of messages) {
          if (!m || typeof m !== "object") continue;
          const o = m as Record<string, unknown>;
          const text = typeof o.text === "string" ? o.text : "";
          rows.push({
            id: `creative_wa_${n++}`,
            platform: "whatsapp",
            headline: name,
            caption: text,
            whatsapp_message: text || null,
            cta: typeof o.cta === "string" ? o.cta : undefined,
          });
        }
      }
    }
  }

  return rows;
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

/** Pick a campaign `image_urls` entry for a row (matches backend flatten order when row ids align). */
export function campaignVisualForRow(
  row: ScheduleRow,
  localIndex: number,
  imageUrls: string[],
  allScheduleRows: ScheduleRow[]
): string | undefined {
  if (!imageUrls.length) return undefined;
  const gi = row.id ? allScheduleRows.findIndex((r) => r.id === row.id) : -1;
  const idx = gi >= 0 ? gi : localIndex;
  return imageUrls[idx % imageUrls.length];
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
