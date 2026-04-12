import type { Artifacts, CampaignRecord } from "../types";

const DEFAULT_PRODUCTS = "Limited drop, Core line, Collab, Accessories";
const DEFAULT_INTERESTS = "Streetwear, Sustainability, Tech, Travel";

/** Build offline QR fields from the globally selected main campaign + its artifacts. */
export function buildOfflinePrefillFromCampaign(
  main: CampaignRecord | undefined,
  artifacts: Artifacts
): {
  title: string;
  headline: string;
  description: string;
  brand_name: string;
  promo_image_urls: string;
  product_options: string;
  interest_tags: string;
} {
  const a = artifacts as Record<string, unknown>;
  const req = (main?.request || {}) as { brand_name?: string };
  const brand_name = (main?.brand_name || req.brand_name || "").trim();

  const exec = typeof a.executive_summary === "string" ? a.executive_summary.trim() : "";
  const positioning = (a.positioning || {}) as Record<string, unknown>;
  const vp =
    (typeof positioning.value_prop === "string" && positioning.value_prop.trim()) ||
    (typeof positioning.statement === "string" && positioning.statement.trim()) ||
    (typeof positioning.headline === "string" && positioning.headline.trim()) ||
    "";

  const headline = (vp || exec.split(/[.!?\n]/)[0] || "").trim().slice(0, 200);
  const description = exec.slice(0, 2000);

  const imgs = ((a.image_urls as string[]) || []).filter(Boolean).slice(0, 12);
  const promo_image_urls = imgs.join("\n");

  const kgraph = a.keyword_graph as { top_keywords?: { keyword: string }[] } | undefined;
  const kw = (kgraph?.top_keywords || [])
    .map((x) => x.keyword)
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .slice(0, 8);
  const interest_tags = kw.length ? kw.join(", ") : DEFAULT_INTERESTS;

  const aud = a.audience_and_messaging as { pillars?: unknown } | undefined;
  const pillars = Array.isArray(aud?.pillars)
    ? aud!.pillars!.filter((p): p is string => typeof p === "string" && p.trim()).slice(0, 8)
    : [];
  const product_options = pillars.length ? pillars.join(", ") : DEFAULT_PRODUCTS;

  const title = brand_name ? `${brand_name} · QR` : "QR campaign";

  return {
    title,
    headline: headline || (brand_name ? `Connect with ${brand_name}` : "Scan to learn more"),
    description: description || headline || "",
    brand_name,
    promo_image_urls,
    product_options,
    interest_tags,
  };
}
