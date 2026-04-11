export type TraceStep = {
  id: string;
  agent: string;
  phase: string;
  title: string;
  summary?: string | null;
  reasoning?: string | null;
  sources: { url: string; title?: string | null }[];
  web_queries: string[];
  tool_calls: { name: string; args: Record<string, unknown>; result_summary?: string | null }[];
  structured?: Record<string, unknown> | null;
  raw_text_excerpt?: string | null;
};

export type Artifacts = Record<string, unknown>;

export type CampaignResultPayload = {
  request: Record<string, unknown>;
  trace: TraceStep[];
  artifacts: Artifacts;
};

export type StreamEvent =
  | { event: "run_started"; payload: { run_id: string } }
  | { event: "graph_node_finished"; payload: { node: string; patch_keys: string[] } }
  | { event: "step_completed"; payload: { step: TraceStep } }
  | { event: "artifact_partial"; payload: { kind: string; data: unknown } }
  | {
      event: "run_completed";
      payload: { run_id: string; campaign_id?: string; result: CampaignResultPayload; errors: string[] };
    }
  | { event: "run_failed"; payload: { error: string } };

export type CampaignRecord = {
  id: string;
  run_id: string;
  brand_name: string;
  status: string;
  request: Record<string, unknown>;
  trace?: TraceStep[];
  artifacts?: Artifacts;
  created_at?: string;
};
