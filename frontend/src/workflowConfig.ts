import {
  FileInput,
  Globe,
  Search,
  Lightbulb,
  Palette,
  ShieldCheck,
  Wrench,
  MapPin,
  CalendarClock,
  PackageCheck,
  Users,
  Brain,
  BadgeCheck,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type PipelineNode = {
  id: string;
  label: string;
  sub: string;
  description: string;
  icon: LucideIcon;
};

export const GRAPH_PIPELINE: readonly PipelineNode[] = [
  {
    id: "ingest",
    label: "Brief",
    sub: "Normalize inputs",
    description: "Parses and validates brand brief, attaches geography targets for downstream localization.",
    icon: FileInput,
  },
  {
    id: "brand_fetch",
    label: "Site crawl",
    sub: "Live HTML signals",
    description: "Crawls the brand URL to extract live positioning, tone, and visual identity signals.",
    icon: Globe,
  },
  {
    id: "parallel_research",
    label: "Intel swarm",
    sub: "Web + Reddit + trends",
    description: "Three parallel agents research competitors, social sentiment, and market trends.",
    icon: Search,
  },
  {
    id: "seo_website",
    label: "SEO audit",
    sub: "Web + your site",
    description:
      "Uses live web search for current SEO guidance, then builds a prioritized, reasoned website optimization plan for this business.",
    icon: TrendingUp,
  },
  {
    id: "strategy",
    label: "Strategy",
    sub: "GTM architecture",
    description: "Synthesizes research into a go-to-market strategy with audience segments and messaging.",
    icon: Lightbulb,
  },
  {
    id: "audience_segments",
    label: "Segments",
    sub: "2–3 micro-audiences",
    description: "Splits the audience into distinct segments with hooks and channel fit before creative generation.",
    icon: Users,
  },
  {
    id: "memory_resolve",
    label: "Memory",
    sub: "Conflict resolution",
    description: "Detects contradictory brand signals across agents and locks unified guardrails for creatives.",
    icon: Brain,
  },
  {
    id: "creatives",
    label: "Creatives",
    sub: "4 parallel channels",
    description: "Generates creative assets across four channels in parallel: social, email, blog, and ads.",
    icon: Palette,
  },
  {
    id: "critic",
    label: "QA critic",
    sub: "Scores & fixes",
    description: "Evaluates creative quality, brand alignment, and audience fit. Flags items for refinement.",
    icon: ShieldCheck,
  },
  {
    id: "refine",
    label: "Refine",
    sub: "Fix low scores",
    description: "Re-generates creatives that scored below threshold. Skipped if all scores pass.",
    icon: Wrench,
  },
  {
    id: "critic_recheck",
    label: "QA recheck",
    sub: "On refined draft",
    description: "Re-scores refined creatives; may trigger another refinement pass up to the configured maximum.",
    icon: BadgeCheck,
  },
  {
    id: "post_critic_parallel",
    label: "Localize & analyze",
    sub: "Geo, keywords, calendar",
    description: "Parallel agents handle geo-localization, keyword graphs, and the campaign calendar.",
    icon: MapPin,
  },
  {
    id: "parallel_schedule_bundle",
    label: "Schedule & assets",
    sub: "Content, perf, visuals",
    description: "Bundles content schedules, performance simulations, and visual assets for delivery.",
    icon: CalendarClock,
  },
  {
    id: "finalize",
    label: "Deliver",
    sub: "Client bundle",
    description: "Packages the complete campaign into a client-ready deliverable with all artifacts.",
    icon: PackageCheck,
  },
] as const;

export const RESEARCH_AGENTS = [
  { id: "competitor_intelligence", short: "Competitors" },
  { id: "social_media_intelligence", short: "Social" },
  { id: "market_trends", short: "Trends" },
] as const;

export type GraphNodeId = (typeof GRAPH_PIPELINE)[number]["id"];
