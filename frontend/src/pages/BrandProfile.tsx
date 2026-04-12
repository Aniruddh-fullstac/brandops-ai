import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  FileUp,
  MapPin,
  Rocket,
  Trash2,
  Upload,
  UserCircle,
  Users,
} from "lucide-react";
import {
  loadClientProfile,
  saveClientProfile,
  newProfileDocumentId,
  type ClientProfile,
  type ProfileDocument,
} from "../lib/clientProfile";

const inp =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-shadow";

async function readFileAsProfileText(file: File): Promise<string> {
  const max = 400_000;
  if (file.size > max) {
    return `[Skipped: file larger than ${Math.round(max / 1024)}KB — ${file.name}]`;
  }
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const t = String(r.result ?? "");
      if (t.length > 48_000) resolve(`${t.slice(0, 48_000)}\n...[truncated]`);
      else resolve(t);
    };
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-3">
        <h2 className="text-sm font-bold text-slate-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>}
      </div>
      <div className="space-y-4 p-5">{children}</div>
    </section>
  );
}

export default function BrandProfile() {
  const [profile, setProfile] = useState<ClientProfile>(() => loadClientProfile());

  useEffect(() => {
    saveClientProfile(profile);
  }, [profile]);

  const removeDoc = useCallback((id: string) => {
    setProfile((p) => ({ ...p, documents: p.documents.filter((d) => d.id !== id) }));
  }, []);

  const onPickFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    const next: ProfileDocument[] = [];
    for (const file of Array.from(files)) {
      if (profile.documents.length + next.length >= 16) break;
      const text = await readFileAsProfileText(file);
      next.push({
        id: newProfileDocumentId(),
        name: file.name,
        text,
        addedAt: new Date().toISOString(),
      });
    }
    if (next.length) setProfile((p) => ({ ...p, documents: [...p.documents, ...next] }));
  }, [profile.documents.length]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md">
            <UserCircle size={22} strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="font-display text-xl font-bold text-slate-900">Brand profile</h1>
            <p className="mt-1 text-sm text-slate-600">
              Everything the agents need to identify your brand, markets, and voice. Saved in this browser. Campaign runs pull
              from here automatically — you only describe each campaign&apos;s focus on the New Campaign page.
            </p>
          </div>
        </div>
        <Link
          to="/campaign/new"
          className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
        >
          <Rocket size={16} />
          New campaign
        </Link>
      </div>

      <SectionCard
        title="Brand presence"
        subtitle="Used for crawling, Instagram analysis, and benchmarks."
      >
        <div className="flex items-start gap-2 rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-xs text-indigo-900">
          <Building2 size={16} className="mt-0.5 shrink-0 text-indigo-500" />
          <span>Brand name is required before running a campaign. Website and Instagram help agents ground research.</span>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">Brand name *</label>
          <input
            value={profile.brand_name}
            onChange={(e) => setProfile({ ...profile, brand_name: e.target.value })}
            className={inp}
            placeholder="e.g. Ettarra Coffee House"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">Website URL</label>
          <input
            value={profile.brand_url}
            onChange={(e) => setProfile({ ...profile, brand_url: e.target.value })}
            className={inp}
            placeholder="https://..."
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">Instagram handle</label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate-400">@</span>
            <input
              value={profile.instagram_handle}
              onChange={(e) => setProfile({ ...profile, instagram_handle: e.target.value })}
              className={`${inp} pl-7`}
              placeholder="yourbrand"
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Target markets"
        subtitle="Optional regions for localization and regional SEO. Leave blank to use sensible defaults."
      >
        <div className="flex items-start gap-2 rounded-lg border border-teal-100 bg-teal-50/50 px-3 py-2 text-xs text-teal-900">
          <MapPin size={16} className="mt-0.5 shrink-0 text-teal-600" />
          <span>Add storefronts or regions you care about. Empty fields are ignored.</span>
        </div>
        <div className="space-y-2">
          {profile.locations.map((loc, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={loc}
                onChange={(e) => {
                  const next = [...profile.locations];
                  next[i] = e.target.value;
                  setProfile({ ...profile, locations: next });
                }}
                className={inp}
                placeholder={i === 0 ? "e.g. Mumbai, India" : "e.g. Austin, TX"}
              />
              {profile.locations.length > 1 && (
                <button
                  type="button"
                  onClick={() =>
                    setProfile({
                      ...profile,
                      locations: profile.locations.filter((_, j) => j !== i),
                    })
                  }
                  className="shrink-0 rounded-lg border border-slate-200 px-2 text-xs font-medium text-slate-500 hover:bg-slate-50"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setProfile({ ...profile, locations: [...profile.locations, ""] })}
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
        >
          + Add location
        </button>
      </SectionCard>

      <SectionCard title="Company & audience" subtitle="Optional — sharpens strategy, creatives, and SEO context.">
        <div className="flex items-start gap-2 rounded-lg border border-violet-100 bg-violet-50/50 px-3 py-2 text-xs text-violet-900">
          <Users size={16} className="mt-0.5 shrink-0 text-violet-500" />
          <span>Longer notes here reduce what you must repeat on every campaign run.</span>
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">Industry</label>
          <input
            value={profile.industry_hint}
            onChange={(e) => setProfile({ ...profile, industry_hint: e.target.value })}
            className={inp}
            placeholder="e.g. Specialty coffee, B2B SaaS"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">Tagline or positioning</label>
          <input
            value={profile.company_tagline}
            onChange={(e) => setProfile({ ...profile, company_tagline: e.target.value })}
            className={inp}
            placeholder="Short phrase the brand uses publicly"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">Target audience</label>
          <textarea
            value={profile.target_audience_hint}
            onChange={(e) => setProfile({ ...profile, target_audience_hint: e.target.value })}
            rows={3}
            className={inp}
            placeholder="Who buys, pain points, buying triggers…"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">Standing brief / brand context</label>
          <textarea
            value={profile.additional_context}
            onChange={(e) => setProfile({ ...profile, additional_context: e.target.value })}
            rows={4}
            className={inp}
            placeholder="Tone, offers, competitors to avoid, ongoing goals…"
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Positioning & voice"
        subtitle="Optional — helps agents differentiate you and stay on-brand."
      >
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">Competitors & positioning</label>
          <textarea
            value={profile.competitor_hints}
            onChange={(e) => setProfile({ ...profile, competitor_hints: e.target.value })}
            rows={3}
            className={inp}
            placeholder="Who you compete with, category alternatives, what not to claim…"
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase text-slate-400">Brand voice notes</label>
          <textarea
            value={profile.brand_voice_notes}
            onChange={(e) => setProfile({ ...profile, brand_voice_notes: e.target.value })}
            rows={3}
            className={inp}
            placeholder="Tone, words to use or avoid, visual cues…"
          />
        </div>
      </SectionCard>

      <SectionCard
        title="Reference documents"
        subtitle="Upload text-friendly files (.txt, .md, .csv, .json). Stored locally in your browser for agent context — not sent to a separate server."
      >
        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <FileUp size={16} className="mt-0.5 shrink-0 text-slate-500" />
          <span>
            Up to 16 files. Large files are truncated. Binary formats (PDF, Word) are not parsed here — export to text or paste
            into the brief above.
          </span>
        </div>

        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 px-4 py-8 transition hover:border-indigo-200 hover:bg-indigo-50/30">
          <Upload className="text-indigo-500" size={24} />
          <span className="text-sm font-medium text-slate-700">Choose files</span>
          <span className="text-[11px] text-slate-500">or drag and drop (browser may only support click on some devices)</span>
          <input
            type="file"
            className="sr-only"
            accept=".txt,.md,.csv,.json,.text,text/plain"
            multiple
            onChange={(e) => void onPickFiles(e.target.files)}
          />
        </label>

        {profile.documents.length > 0 && (
          <ul className="space-y-2">
            {profile.documents.map((d) => (
              <li
                key={d.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-slate-800">{d.name}</p>
                  <p className="mt-0.5 text-slate-500">
                    {d.text.length.toLocaleString()} chars · {new Date(d.addedAt).toLocaleString()}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeDoc(d.id)}
                  className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  aria-label={`Remove ${d.name}`}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <p className="text-center text-[11px] text-slate-400">Changes save automatically to this device.</p>
    </div>
  );
}
