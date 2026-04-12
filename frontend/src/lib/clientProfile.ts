/** Persisted per-client inputs for campaign runs (local profile, not server account). */

export type ProfileDocument = {
  id: string;
  name: string;
  text: string;
  addedAt: string;
};

export type ClientProfile = {
  brand_name: string;
  brand_url: string;
  instagram_handle: string;
  locations: string[];
  industry_hint: string;
  company_tagline: string;
  target_audience_hint: string;
  additional_context: string;
  /** Optional: named competitors, positioning, or brands to contrast with */
  competitor_hints: string;
  /** Optional: tone, words to use/avoid, visual cues */
  brand_voice_notes: string;
  documents: ProfileDocument[];
};

const STORAGE_KEY = "knowyourbrand:clientProfile";
const STORAGE_KEY_LEGACY = "campaigngraph:clientProfile";

export function newProfileDocumentId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const CLIENT_PROFILE_UPDATED = "knowyourbrand:client-profile-updated";

export const CAMPAIGN_MODE_OPTIONS = [
  { id: "full", label: "Full pipeline", hint: "Research → strategy → creatives → schedule & delivery" },
  { id: "research", label: "Market & competitor intel", hint: "Emphasize research, trends, and landscape" },
  { id: "creative", label: "Messaging & creatives", hint: "Emphasize copy, channels, and creative QA" },
  { id: "seo", label: "SEO & site audit", hint: "Emphasize technical and on-page SEO for your URL" },
] as const;

export type CampaignModeId = (typeof CAMPAIGN_MODE_OPTIONS)[number]["id"];

export const defaultClientProfile = (): ClientProfile => ({
  brand_name: "",
  brand_url: "",
  instagram_handle: "",
  locations: ["", ""],
  industry_hint: "",
  company_tagline: "",
  target_audience_hint: "",
  additional_context: "",
  competitor_hints: "",
  brand_voice_notes: "",
  documents: [],
});

export function loadClientProfile(): ClientProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(STORAGE_KEY_LEGACY);
    if (!raw) return defaultClientProfile();
    const p = JSON.parse(raw) as Partial<ClientProfile>;
    const base = defaultClientProfile();
    const locs = Array.isArray(p.locations) ? p.locations.map((x) => String(x)) : base.locations;
    const docs = Array.isArray(p.documents)
      ? p.documents
          .filter((d): d is ProfileDocument => d && typeof d.name === "string" && typeof d.text === "string")
          .map((d) => ({
            id: typeof d.id === "string" ? d.id : newProfileDocumentId(),
            name: d.name,
            text: String(d.text).slice(0, 48_000),
            addedAt: typeof d.addedAt === "string" ? d.addedAt : new Date().toISOString(),
          }))
      : [];
    return {
      ...base,
      ...p,
      locations: locs.length ? locs : ["", ""],
      competitor_hints: typeof p.competitor_hints === "string" ? p.competitor_hints : "",
      brand_voice_notes: typeof p.brand_voice_notes === "string" ? p.brand_voice_notes : "",
      documents: docs.slice(0, 16),
    };
  } catch {
    return defaultClientProfile();
  }
}

export function saveClientProfile(p: ClientProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    try {
      localStorage.removeItem(STORAGE_KEY_LEGACY);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new CustomEvent(CLIENT_PROFILE_UPDATED));
  } catch {
    /* ignore quota */
  }
}

const MAX_ADDITIONAL_CONTEXT = 115_000;

/** Assembles one `additional_context` string for the campaign API from saved profile + this-run options. */
export function buildCampaignAdditionalContext(
  profile: ClientProfile,
  opts: { campaignMode: CampaignModeId | string; campaignBrief: string }
): string | null {
  const parts: string[] = [];
  const mode = CAMPAIGN_MODE_OPTIONS.find((m) => m.id === opts.campaignMode) || CAMPAIGN_MODE_OPTIONS[0];
  parts.push(`## This campaign run\nFocus mode: ${mode.label} — ${mode.hint}`);
  if (opts.campaignBrief.trim()) {
    parts.push(`### What you want for this specific campaign\n${opts.campaignBrief.trim()}`);
  }
  const base = profile.additional_context?.trim();
  if (base) parts.push(`## Saved brand context (from profile)\n${base}`);
  if (profile.competitor_hints?.trim()) {
    parts.push(`## Competitors & positioning (from profile)\n${profile.competitor_hints.trim()}`);
  }
  if (profile.brand_voice_notes?.trim()) {
    parts.push(`## Brand voice & tone (from profile)\n${profile.brand_voice_notes.trim()}`);
  }
  if (profile.documents?.length) {
    const docBlock = profile.documents.map((d) => `### ${d.name}\n${d.text}`).join("\n\n");
    parts.push(`## Reference documents (uploaded on profile)\n${docBlock}`);
  }
  const joined = parts.join("\n\n").trim();
  if (!joined) return null;
  if (joined.length > MAX_ADDITIONAL_CONTEXT) {
    return `${joined.slice(0, MAX_ADDITIONAL_CONTEXT)}\n\n...[truncated for API limit]`;
  }
  return joined;
}
