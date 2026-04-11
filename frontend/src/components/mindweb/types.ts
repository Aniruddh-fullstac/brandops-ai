import type { LucideIcon } from "lucide-react";

export type AgentStatus = "idle" | "loading" | "complete";

export type AgentNodeData = {
  id: string;
  name: string;
  sub: string;
  status: AgentStatus;
  icon: LucideIcon;
  dependencies: string[];
  /** Brand-specific live info from trace steps */
  liveTitle?: string;
  liveSummary?: string;
  liveQueries?: string[];
  liveSources?: { url: string; title?: string | null }[];
  liveTools?: string[];
};
