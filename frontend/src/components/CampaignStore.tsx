import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged } from "firebase/auth";
import { apiJson } from "../lib/api";
import { auth } from "../lib/firebase";
import { GRAPH_PIPELINE } from "../workflowConfig";
import type { AgentActivity, Artifacts, CampaignRecord, CampaignResultPayload, TraceStep } from "../types";

const LAST_CAMPAIGN_KEY = "campaigngraph:lastCampaignId";

/** When true, `refreshFromServer` updates the campaign list but does not hydrate the last run into the UI (used on New Campaign page). */
let skipHydrateLatestCampaign = false;

export function setSkipHydrateLatestCampaign(skip: boolean) {
  skipHydrateLatestCampaign = skip;
}

type Store = {
  runId: string | null;
  campaignId: string | null;
  busy: boolean;
  steps: TraceStep[];
  activities: AgentActivity[];
  graphNodesDone: Set<string>;
  partial: Record<string, unknown>;
  result: CampaignResultPayload | null;
  errors: string[];
  banner: string | null;
  artifacts: Artifacts;
  hydrateLoading: boolean;
  /** All campaigns available for this user */
  campaignList: CampaignRecord[];
  setRunId: (v: string | null) => void;
  setCampaignId: (v: string | null) => void;
  setBusy: (v: boolean) => void;
  setSteps: (steps: TraceStep[]) => void;
  addStep: (s: TraceStep) => void;
  addActivity: (a: AgentActivity) => void;
  addGraphNode: (n: string) => void;
  setPartial: (k: string, v: unknown) => void;
  setResult: (r: CampaignResultPayload | null) => void;
  setErrors: (e: string[]) => void;
  setBanner: (b: string | null) => void;
  reset: () => void;
  refreshFromServer: () => Promise<void>;
  /** Switch to a specific campaign by ID */
  loadCampaign: (id: string) => Promise<void>;
};

const Ctx = createContext<Store>(null!);

function hasArtifactPayload(a: unknown): a is Record<string, unknown> {
  if (!a || typeof a !== "object") return false;
  return Object.keys(a as object).length > 0;
}

export function CampaignStoreProvider({ children }: { children: ReactNode }) {
  const [runId, setRunId] = useState<string | null>(null);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [steps, setStepsState] = useState<TraceStep[]>([]);
  const [activities, setActivities] = useState<AgentActivity[]>([]);
  const [graphNodesDone, setGraphNodesDone] = useState<Set<string>>(new Set());
  const [partial, _setPartial] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<CampaignResultPayload | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [banner, setBanner] = useState<string | null>(null);
  const [hydrateLoading, setHydrateLoading] = useState(true);
  const [campaignList, setCampaignList] = useState<CampaignRecord[]>([]);
  const hydratedOnce = useRef(false);

  const addStep = (s: TraceStep) => setStepsState((p) => [...p, s]);
  const addActivity = (a: AgentActivity) => setActivities((p) => [...p, a]);
  const addGraphNode = (n: string) => setGraphNodesDone((p) => new Set([...p, n]));
  const setPartial = (k: string, v: unknown) => _setPartial((p) => ({ ...p, [k]: v }));
  const setSteps = (s: TraceStep[]) => setStepsState(s);

  const reset = useCallback(() => {
    setRunId(null);
    setCampaignId(null);
    setStepsState([]);
    setActivities([]);
    setGraphNodesDone(new Set());
    _setPartial({});
    setResult(null);
    setErrors([]);
    setBanner(null);
  }, []);

  const hydrateFromRecord = useCallback((c: CampaignRecord) => {
    const arts = (c.artifacts && hasArtifactPayload(c.artifacts) ? c.artifacts : {}) as Artifacts;
    setRunId(c.run_id ?? null);
    setCampaignId(c.id ?? null);
    setStepsState(c.trace || []);
    setActivities([]);
    setResult({
      request: (c.request || {}) as Record<string, unknown>,
      trace: c.trace || [],
      artifacts: arts,
    });
    _setPartial({ final_artifacts: arts });
    setErrors([]);
    setGraphNodesDone(new Set(GRAPH_PIPELINE.map((n) => n.id)));
  }, []);

  /** Load a specific campaign by ID and switch to it */
  const loadCampaign = useCallback(async (id: string) => {
    try {
      const full = await apiJson<CampaignRecord>(`/api/campaigns/${id}`);
      if (full.artifacts && hasArtifactPayload(full.artifacts)) {
        hydrateFromRecord(full);
        rememberLastCampaignId(id);
      }
    } catch {
      /* ignore */
    }
  }, [hydrateFromRecord]);

  const refreshFromServer = useCallback(async () => {
    try {
      const list = await apiJson<{ campaigns: CampaignRecord[] }>("/api/campaigns");
      const campaigns = list.campaigns || [];
      setCampaignList(campaigns);

      const completed = campaigns.filter((x) => x.status === "completed");
      if (!completed.length) return;

      if (skipHydrateLatestCampaign) {
        return;
      }

      let pick = completed[0];
      try {
        const sid = sessionStorage.getItem(LAST_CAMPAIGN_KEY);
        if (sid) {
          const hit = completed.find((c) => c.id === sid);
          if (hit) pick = hit;
        }
      } catch {
        /* ignore */
      }

      const full = await apiJson<CampaignRecord>(`/api/campaigns/${pick.id}`);
      if (full.artifacts && hasArtifactPayload(full.artifacts)) {
        hydrateFromRecord(full);
      }
    } catch {
      /* unauthenticated or API down */
    }
  }, [hydrateFromRecord]);

  useEffect(() => {
    if (hydratedOnce.current) return;
    hydratedOnce.current = true;
    (async () => {
      setHydrateLoading(true);
      try {
        await refreshFromServer();
      } finally {
        setHydrateLoading(false);
      }
    })();
  }, [refreshFromServer]);

  // Firebase auth resolves after first paint; reload saved campaign once the user (and ID token) exist.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) void refreshFromServer();
    });
    return () => unsub();
  }, [refreshFromServer]);

  const artifacts = (result?.artifacts || partial.final_artifacts || {}) as Artifacts;

  return (
    <Ctx.Provider
      value={{
        runId,
        campaignId,
        busy,
        steps,
        activities,
        graphNodesDone,
        partial,
        result,
        errors,
        banner,
        artifacts,
        hydrateLoading,
        campaignList,
        setRunId,
        setCampaignId,
        setBusy,
        setSteps,
        addStep,
        addActivity,
        addGraphNode,
        setPartial,
        setResult,
        setErrors,
        setBanner,
        reset,
        refreshFromServer,
        loadCampaign,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export const useCampaignStore = () => useContext(Ctx);

export function rememberLastCampaignId(id: string) {
  try {
    sessionStorage.setItem(LAST_CAMPAIGN_KEY, id);
  } catch {
    /* ignore */
  }
}
