import type { TraceStep } from "../types";

/** Short lines for “What we ran” from trace steps (deduped by title). */
export function buildDidLines(
  steps: TraceStep[],
  match: (s: TraceStep) => boolean,
  max = 5
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of steps) {
    if (!match(s)) continue;
    const line = (s.title || "").trim() || s.phase;
    if (!line || seen.has(line)) continue;
    seen.add(line);
    out.push(line);
    if (out.length >= max) break;
  }
  return out;
}

export function formatSourcesLine(sources: { url: string; title?: string | null }[]): {
  count: number;
  hostSample: string[];
} {
  const hosts: string[] = [];
  for (const s of sources) {
    try {
      const h = new URL(s.url).hostname.replace(/^www\./, "");
      if (h && !hosts.includes(h)) hosts.push(h);
    } catch {
      /* skip */
    }
  }
  return { count: sources.length, hostSample: hosts.slice(0, 6) };
}

export function extractStrategyInsight(
  positioning: Record<string, unknown> | undefined,
  audienceMsg: Record<string, unknown> | undefined,
  channelStrategy: Record<string, unknown> | undefined,
  strategyStep: TraceStep | undefined
): { headline: string; bullets: string[] } {
  const bullets: string[] = [];
  const vp =
    (positioning?.value_prop as string) ||
    (positioning?.statement as string) ||
    (positioning?.headline as string) ||
    "";
  const headline =
    vp ||
    (typeof strategyStep?.summary === "string" ? strategyStep.summary.slice(0, 280) : "");

  const pillars = audienceMsg?.pillars;
  if (Array.isArray(pillars)) {
    for (const p of pillars) {
      if (typeof p === "string" && p.trim() && bullets.length < 4) bullets.push(p.trim());
    }
  }

  const proof = positioning?.proof_points;
  if (Array.isArray(proof)) {
    for (const p of proof) {
      if (typeof p === "string" && p.trim() && bullets.length < 4) bullets.push(p.trim());
    }
  }

  const plan = channelStrategy?.channel_plan;
  if (Array.isArray(plan) && bullets.length < 4) {
    for (const row of plan.slice(0, 3)) {
      if (row && typeof row === "object" && "channel" in row) {
        const ch = (row as { channel?: string; objective?: string }).channel;
        const ob = (row as { objective?: string }).objective;
        if (typeof ch === "string") {
          bullets.push(ob ? `${ch}: ${ob}` : ch);
        }
      }
      if (bullets.length >= 4) break;
    }
  }

  if (bullets.length === 0 && strategyStep?.reasoning) {
    bullets.push(strategyStep.reasoning.slice(0, 240) + (strategyStep.reasoning.length > 240 ? "…" : ""));
  }

  return { headline, bullets: bullets.slice(0, 4) };
}

export function extractSocialInsight(social: Record<string, unknown> | undefined): {
  headline: string;
  bullets: string[];
} {
  const rs = social?.reasoning_summary;
  const headline =
    typeof rs === "string" && rs.trim()
      ? rs.trim().slice(0, 360) + (rs.length > 360 ? "…" : "")
      : "Channel-native ideas generated for your priority networks (social bundle).";

  const bullets: string[] = [];
  const keys = ["instagram", "linkedin", "twitter", "reels_short_form", "email_broadcasts"] as const;
  for (const k of keys) {
    const v = social?.[k];
    if (Array.isArray(v) && v.length > 0) {
      bullets.push(`${k.replace(/_/g, " ")}: ${v.length} item(s)`);
    }
    if (bullets.length >= 4) break;
  }

  return { headline, bullets: bullets.slice(0, 4) };
}

export function truncate(s: string, n: number): string {
  const t = s.trim();
  if (t.length <= n) return t;
  return t.slice(0, n).trim() + "…";
}
