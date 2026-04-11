import type { LucideIcon } from "lucide-react";
import type { AgentActivity } from "../../types";

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
  /** Full tool invocations (name + outcome) from trace steps */
  liveToolCalls?: { name: string; result_summary?: string | null }[];
  /** Real-time activity feed from agent_activity events */
  liveActivities?: AgentActivity[];
};
