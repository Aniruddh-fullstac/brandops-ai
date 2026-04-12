/** Persisted per-client inputs for campaign runs (local profile, not server account). */

export type ClientProfile = {
  brand_name: string;
  brand_url: string;
  instagram_handle: string;
  locations: string[];
  industry_hint: string;
  company_tagline: string;
  target_audience_hint: string;
  additional_context: string;
};

const STORAGE_KEY = "campaigngraph:clientProfile";

export const defaultClientProfile = (): ClientProfile => ({
  brand_name: "",
  brand_url: "",
  instagram_handle: "",
  locations: ["", ""],
  industry_hint: "",
  company_tagline: "",
  target_audience_hint: "",
  additional_context: "",
});

export function loadClientProfile(): ClientProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultClientProfile();
    const p = JSON.parse(raw) as Partial<ClientProfile>;
    const base = defaultClientProfile();
    const locs = Array.isArray(p.locations) ? p.locations.map((x) => String(x)) : base.locations;
    return {
      ...base,
      ...p,
      locations: locs.length ? locs : ["", ""],
    };
  } catch {
    return defaultClientProfile();
  }
}

export function saveClientProfile(p: ClientProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore quota */
  }
}
