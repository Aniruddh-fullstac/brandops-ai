import type { TraceStep } from "../types";

export type SourceRef = { url: string; title?: string | null };

/** Deduplicate sources by URL across matching trace steps. */
export function collectSources(steps: TraceStep[], match: (s: TraceStep) => boolean): SourceRef[] {
  const map = new Map<string, SourceRef>();
  for (const s of steps) {
    if (!match(s)) continue;
    for (const src of s.sources || []) {
      const u = (src.url || "").trim();
      if (u && !map.has(u)) map.set(u, { url: u, title: src.title });
    }
  }
  return [...map.values()];
}

export const sourceMatchers = {
  strategy: (s: TraceStep) => s.phase === "strategy" || /strateg/i.test(s.agent),
  researchTrends: (s: TraceStep) =>
    s.phase === "research" && (/trend/i.test(s.agent) || /trend/i.test(s.title)),
  researchSocial: (s: TraceStep) =>
    s.phase === "research" && (/social/i.test(s.agent) || /social/i.test(s.title)),
  researchCompetitor: (s: TraceStep) =>
    s.phase === "research" && (/competitor/i.test(s.agent) || /competitor/i.test(s.title)),
  brandFetch: (s: TraceStep) => s.phase === "brand_fetch",
  creatives: (s: TraceStep) => s.phase === "creative" || s.phase === "refine",
  critic: (s: TraceStep) => s.phase === "critic",
  seo: (s: TraceStep) => /seo/i.test(s.agent) || /seo/i.test(s.title),
  localize: (s: TraceStep) => s.phase === "localize",
  audience: (s: TraceStep) => s.phase === "audience" || /segment/i.test(s.agent),
  performance: (s: TraceStep) => s.phase === "performance",
  keywordGraph: (s: TraceStep) => s.phase === "keyword_graph" || /keyword_graph/i.test(s.agent),
  timing: (s: TraceStep) => s.phase === "timing",
  visuals: (s: TraceStep) => s.phase === "visual",
};
