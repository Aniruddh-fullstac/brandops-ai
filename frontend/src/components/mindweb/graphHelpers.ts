import type { TraceStep } from "../../types";

/** DAG dependencies between pipeline nodes */
export const DEPENDENCIES: Record<string, string[]> = {
  ingest: [],
  brand_fetch: ["ingest"],
  parallel_research: ["brand_fetch"],
  strategy: ["parallel_research"],
  audience_segments: ["strategy"],
  memory_resolve: ["audience_segments"],
  creatives: ["memory_resolve"],
  critic: ["creatives"],
  refine: ["critic"],
  critic_recheck: ["refine"],
  post_critic_parallel: ["critic_recheck", "critic"],
  parallel_schedule_bundle: ["post_critic_parallel"],
  finalize: ["parallel_schedule_bundle"],
};

/**
 * Maps pipeline node IDs → backend phase strings.
 *
 * The backend uses different phase names than the graph node IDs:
 *   - "parallel_research" node → steps with phase "research"
 *   - "creatives" node → steps with phase "creative"
 *   - "post_critic_parallel" → steps with phases "localize", "keyword_graph", "timing"
 *   - "parallel_schedule_bundle" → steps with phases "content_schedule", "performance", "visual"
 *
 * Steps whose phase exactly matches a node ID are also captured (ingest, brand_fetch, strategy, critic, refine, finalize).
 */
const NODE_TO_PHASES: Record<string, string[]> = {
  ingest: ["ingest"],
  brand_fetch: ["brand_fetch"],
  parallel_research: ["research"],
  strategy: ["strategy"],
  audience_segments: ["audience"],
  memory_resolve: ["memory"],
  creatives: ["creative"],
  critic: ["critic"],
  refine: ["refine"],
  critic_recheck: ["critic_recheck"],
  post_critic_parallel: ["localize", "keyword_graph", "timing"],
  parallel_schedule_bundle: ["content_schedule", "performance", "visual"],
  finalize: ["finalize"],
};

/** Get all trace steps that belong to a given pipeline node */
export function getStepsForNode(nodeId: string, steps: TraceStep[]): TraceStep[] {
  const phases = NODE_TO_PHASES[nodeId];
  if (!phases) return steps.filter((s) => s.phase === nodeId);
  const phaseSet = new Set(phases);
  return steps.filter((s) => phaseSet.has(s.phase));
}

/** Reverse lookup: given a backend phase string, find the pipeline node ID */
const PHASE_TO_NODE: Record<string, string> = {};
for (const [nodeId, phases] of Object.entries(NODE_TO_PHASES)) {
  for (const p of phases) PHASE_TO_NODE[p] = nodeId;
}

export function getNodeIdForPhase(phase: string): string | undefined {
  return PHASE_TO_NODE[phase] || (Object.keys(NODE_TO_PHASES).includes(phase) ? phase : undefined);
}

/** Graph node IDs that still have in-flight work (trace arrived but node not finished in the DAG). */
export function getActiveNodeIdsFromSteps(steps: TraceStep[], graphNodesDone: Set<string>): Set<string> {
  const ids = new Set<string>();
  for (const s of steps) {
    const nid = getNodeIdForPhase(s.phase) ?? s.phase;
    if (!graphNodesDone.has(nid)) ids.add(nid);
  }
  return ids;
}

/** Merge reasoning + summary from every trace step in this node for the inspector panel. */
export function mergeStepFindings(phaseSteps: TraceStep[]): string | undefined {
  const blocks: string[] = [];
  for (const s of phaseSteps) {
    const bits: string[] = [];
    if (s.reasoning?.trim()) bits.push(s.reasoning.trim());
    if (s.summary?.trim()) bits.push(s.summary.trim());
    if (bits.length) blocks.push(bits.join("\n\n"));
  }
  return blocks.length ? blocks.join("\n\n—\n\n") : undefined;
}
