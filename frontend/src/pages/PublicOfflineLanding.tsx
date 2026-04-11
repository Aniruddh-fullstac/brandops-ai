import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Check, ChevronLeft, ChevronRight, Heart, MapPin, Sparkles, Star } from "lucide-react";
import { publicJson, publicPostJson } from "../lib/api";

type PublicCampaign = {
  id: string;
  slug: string;
  title: string;
  headline: string;
  description: string;
  brand_name: string;
  promo_image_urls: string[];
  product_options: string[];
  interest_tags: string[];
  collect_name: boolean;
  collect_email: boolean;
  collect_phone: boolean;
  collect_age_range: boolean;
};

type Context = {
  is_return_visitor: boolean;
  crowd_favorites: string[];
};

const SESSION_KEY = "cg_offline_sess_v1";

function sessionIdFor(slug: string): string {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    const map: Record<string, string> = raw ? JSON.parse(raw) : {};
    if (!map[slug]) {
      map[slug] = crypto.randomUUID();
      localStorage.setItem(SESSION_KEY, JSON.stringify(map));
    }
    return map[slug];
  } catch {
    return crypto.randomUUID();
  }
}

const AGE_OPTIONS = ["Under 18", "18–24", "25–34", "35–44", "45–54", "55+"];

export default function PublicOfflineLanding() {
  const { slug } = useParams<{ slug: string }>();
  const [search] = useSearchParams();
  const locLabel = search.get("loc")?.trim() || undefined;

  const [campaign, setCampaign] = useState<PublicCampaign | null>(null);
  const [ctx, setCtx] = useState<Context | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [imgIdx, setImgIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const [selected, setSelected] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);
  const [rating, setRating] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [ageRange, setAgeRange] = useState("");
  const [consentMarketing, setConsentMarketing] = useState(false);
  const [consentAnalytics, setConsentAnalytics] = useState(true);

  const sid = useMemo(() => (slug ? sessionIdFor(slug) : ""), [slug]);

  const load = useCallback(async () => {
    if (!slug) return;
    setLoading(true);
    setErr(null);
    try {
      const c = await publicJson<PublicCampaign>(`/api/public/offline/${encodeURIComponent(slug)}`);
      setCampaign(c);
      const cx = await publicJson<Context>(
        `/api/public/offline/${encodeURIComponent(slug)}/context?session_id=${encodeURIComponent(sid)}`
      );
      setCtx(cx);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [slug, sid]);

  useEffect(() => {
    void load();
  }, [load]);

  const images = campaign?.promo_image_urls?.filter(Boolean) ?? [];
  const showCarousel = images.length > 0;

  const toggle = (arr: string[], v: string, set: (x: string[]) => void) => {
    if (arr.includes(v)) set(arr.filter((x) => x !== v));
    else set([...arr, v]);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slug || !campaign) return;
    setSubmitting(true);
    setErr(null);
    try {
      await publicPostJson(`/api/public/offline/${encodeURIComponent(slug)}/submit`, {
        session_id: sid,
        location_label: locLabel,
        selected_products: selected,
        rating: rating ?? undefined,
        interests,
        name: campaign.collect_name ? name || undefined : undefined,
        email: campaign.collect_email ? email || undefined : undefined,
        phone: campaign.collect_phone ? phone || undefined : undefined,
        age_range: campaign.collect_age_range ? ageRange || undefined : undefined,
        consent_marketing: consentMarketing,
        consent_analytics: consentAnalytics,
      });
      setDone(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-950 via-indigo-950 to-teal-900">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white" />
      </div>
    );
  }

  if (err && !campaign) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-center text-white">
        <p className="text-lg font-medium">This campaign is not available.</p>
        <p className="mt-2 text-sm text-white/60">{err}</p>
      </div>
    );
  }

  if (!campaign) return null;

  if (done) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-indigo-950 to-teal-900 px-6 py-16 text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-500/20 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-lg text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 backdrop-blur">
            <Check className="h-8 w-8 text-emerald-400" strokeWidth={2.5} />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Thank you</h1>
          <p className="mt-3 text-white/75">
            {campaign.brand_name ? `${campaign.brand_name} appreciates your time.` : "Your responses help us serve you better."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-950 via-indigo-950 to-teal-900 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(99,102,241,0.25),transparent_50%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_80%_100%,rgba(20,184,166,0.2),transparent_45%)]" />

      <header className="relative border-b border-white/10 bg-black/20 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-5 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-teal-500 shadow-lg shadow-indigo-500/30">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-teal-300/90">
                {campaign.brand_name || "Brand experience"}
              </p>
              <h1 className="font-display text-lg font-bold leading-tight text-white">{campaign.title}</h1>
            </div>
          </div>
          {locLabel && (
            <div className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white/80">
              <MapPin className="h-3.5 w-3.5 text-teal-300" />
              {locLabel}
            </div>
          )}
        </div>
      </header>

      <main className="relative mx-auto max-w-3xl px-5 pb-20 pt-8">
        {ctx?.is_return_visitor && (
          <div className="mb-6 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/95 backdrop-blur">
            Welcome back — here are picks other visitors loved recently.
            {ctx.crowd_favorites.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {ctx.crowd_favorites.map((x) => (
                  <span
                    key={x}
                    className="rounded-lg bg-white/10 px-2 py-0.5 text-xs font-medium text-white"
                  >
                    {x}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {showCarousel ? (
          <div className="relative mb-10 overflow-hidden rounded-3xl border border-white/10 bg-black/30 shadow-2xl shadow-black/40">
            <div className="aspect-[16/10] w-full">
              <img
                src={images[imgIdx]}
                alt=""
                className="h-full w-full object-cover"
              />
            </div>
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous"
                  className="absolute left-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70"
                  onClick={() => setImgIdx((i) => (i - 1 + images.length) % images.length)}
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  aria-label="Next"
                  className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur transition hover:bg-black/70"
                  onClick={() => setImgIdx((i) => (i + 1) % images.length)}
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
                <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                  {images.map((_, i) => (
                    <button
                      key={i}
                      type="button"
                      aria-label={`Slide ${i + 1}`}
                      className={`h-1.5 rounded-full transition ${i === imgIdx ? "w-6 bg-white" : "w-1.5 bg-white/40"}`}
                      onClick={() => setImgIdx(i)}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="mb-10 aspect-[16/9] w-full rounded-3xl bg-gradient-to-br from-indigo-600/40 to-teal-600/30 ring-1 ring-white/10" />
        )}

        <div className="mb-8 rounded-3xl border border-white/10 bg-white/[0.07] p-6 backdrop-blur-xl">
          {campaign.headline && (
            <h2 className="font-display text-2xl font-bold tracking-tight text-white">{campaign.headline}</h2>
          )}
          {campaign.description && (
            <p className="mt-3 text-sm leading-relaxed text-white/75">{campaign.description}</p>
          )}
        </div>

        <form onSubmit={submit} className="space-y-8">
          <section className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur-xl">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Heart className="h-4 w-4 text-rose-400" />
              What resonates with you?
            </div>
            <p className="mt-1 text-xs text-white/55">Tap all that apply.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {(campaign.product_options.length ? campaign.product_options : ["Option A", "Option B", "Option C"]).map(
                (opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => toggle(selected, opt, setSelected)}
                    className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                      selected.includes(opt)
                        ? "border-teal-400/80 bg-teal-500/25 text-teal-50"
                        : "border-white/15 bg-white/5 text-white/80 hover:border-white/30"
                    }`}
                  >
                    {opt}
                  </button>
                )
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur-xl">
            <div className="flex items-center gap-2 text-sm font-semibold text-white">
              <Star className="h-4 w-4 text-amber-400" />
              Overall vibe
            </div>
            <p className="mt-1 text-xs text-white/55">1 = low, 5 = love it.</p>
            <div className="mt-4 flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  className={`flex h-12 w-12 items-center justify-center rounded-xl border text-lg font-bold transition ${
                    rating === n
                      ? "border-amber-400/90 bg-amber-500/20 text-amber-100"
                      : "border-white/15 bg-white/5 text-white/70 hover:border-white/35"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </section>

          {(campaign.interest_tags.length > 0 || (ctx?.crowd_favorites?.length ?? 0) > 0) && (
            <section className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur-xl">
              <div className="text-sm font-semibold text-white">Interests</div>
              <p className="mt-1 text-xs text-white/55">Shape future drops and collabs.</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  ...new Set([...campaign.interest_tags, ...(ctx?.crowd_favorites || [])]),
                ].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggle(interests, tag, setInterests)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                      interests.includes(tag)
                        ? "border-indigo-400/80 bg-indigo-500/25 text-indigo-50"
                        : "border-white/15 bg-white/5 text-white/75 hover:border-white/30"
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </section>
          )}

          {(campaign.collect_name || campaign.collect_email || campaign.collect_phone || campaign.collect_age_range) && (
            <section className="rounded-3xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur-xl">
              <div className="text-sm font-semibold text-white">Stay in the loop</div>
              <p className="mt-1 text-xs text-white/55">Optional — for updates and offers you choose.</p>
              <div className="mt-4 space-y-3">
                {campaign.collect_name && (
                  <input
                    className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-teal-400/50 focus:outline-none focus:ring-1 focus:ring-teal-400/30"
                    placeholder="Name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                )}
                {campaign.collect_email && (
                  <input
                    type="email"
                    className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-teal-400/50 focus:outline-none focus:ring-1 focus:ring-teal-400/30"
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                )}
                {campaign.collect_phone && (
                  <input
                    type="tel"
                    className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-teal-400/50 focus:outline-none focus:ring-1 focus:ring-teal-400/30"
                    placeholder="Phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                )}
                {campaign.collect_age_range && (
                  <select
                    className="w-full rounded-xl border border-white/15 bg-black/30 px-4 py-3 text-sm text-white focus:border-teal-400/50 focus:outline-none focus:ring-1 focus:ring-teal-400/30"
                    value={ageRange}
                    onChange={(e) => setAgeRange(e.target.value)}
                  >
                    <option value="" className="bg-slate-900">
                      Age range (optional)
                    </option>
                    {AGE_OPTIONS.map((a) => (
                      <option key={a} value={a} className="bg-slate-900">
                        {a}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </section>
          )}

          <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-xs leading-relaxed text-white/60">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-white/30 bg-white/10"
                checked={consentAnalytics}
                onChange={(e) => setConsentAnalytics(e.target.checked)}
              />
              <span>
                Help improve this experience with anonymous usage analytics (approximate region from your connection may
                be processed on our servers).
              </span>
            </label>
            <label className="mt-3 flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                className="mt-0.5 rounded border-white/30 bg-white/10"
                checked={consentMarketing}
                onChange={(e) => setConsentMarketing(e.target.checked)}
              />
              <span>Email me about offers and launches (optional).</span>
            </label>
          </div>

          {err && <p className="text-center text-sm text-rose-300">{err}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-2xl bg-gradient-to-r from-indigo-500 to-teal-500 py-4 text-sm font-bold uppercase tracking-wide text-white shadow-lg shadow-indigo-500/25 transition hover:brightness-110 disabled:opacity-50"
          >
            {submitting ? "Sending…" : "Submit"}
          </button>
        </form>

        <p className="mt-10 text-center text-[10px] text-white/35">
          Responses are used to improve products and experiences. You can contact the brand’s privacy policy for details.
        </p>
      </main>
    </div>
  );
}
