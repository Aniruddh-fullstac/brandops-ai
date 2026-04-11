export const GRAPH_PIPELINE = [
  { id: "ingest", label: "Brief", sub: "Normalize inputs" },
  { id: "brand_fetch", label: "Site crawl", sub: "Live HTML signals" },
  { id: "parallel_research", label: "Intel swarm", sub: "Web + Reddit + trends" },
  { id: "strategy", label: "Strategy", sub: "GTM architecture" },
  { id: "creatives", label: "Creatives", sub: "4 parallel channels" },
  { id: "critic", label: "QA critic", sub: "Scores & fixes" },
  { id: "refine", label: "Refine", sub: "Fix low scores" },
  { id: "localize", label: "Localize", sub: "Dual geo" },
  { id: "keyword_graph", label: "Keywords", sub: "PageRank graph" },
  { id: "timing", label: "Calendar", sub: "30-day plan" },
  { id: "audience", label: "Segments", sub: "2-3 personas" },
  { id: "perf_sim", label: "Simulate", sub: "Projections" },
  { id: "visuals", label: "Visuals", sub: "Key art" },
  { id: "finalize", label: "Deliver", sub: "Client bundle" },
] as const;

export const RESEARCH_AGENTS = [
  { id: "competitor_intelligence", short: "Competitors" },
  { id: "social_media_intelligence", short: "Social" },
  { id: "market_trends", short: "Trends" },
] as const;

export type GraphNodeId = (typeof GRAPH_PIPELINE)[number]["id"];
