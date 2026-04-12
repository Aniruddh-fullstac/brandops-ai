import { useState } from "react";
import { ChevronDown, Clapperboard, Clock, Film, Layers, Mic2, Play, Sparkles, Target, Zap } from "lucide-react";

interface VideoConcept {
  title?: string;
  concept_title?: string;
  headline?: string;
  format?: string;
  duration?: string;
  hook?: string;
  script?: string | Record<string, string>;
  script_breakdown?: Record<string, string> | Array<{ timestamp?: string; scene?: string; narration?: string; action?: string }>;
  visual_direction?: string;
  voiceover?: string;
  music_vibe?: string;
  cta?: string;
  platform?: string;
  target_audience?: string;
  key_message?: string;
  [key: string]: unknown;
}

function ScriptBreakdown({ script }: { script: VideoConcept["script_breakdown"] }) {
  if (!script) return null;

  if (Array.isArray(script)) {
    return (
      <div className="space-y-2">
        {script.map((scene, i) => (
          <div key={i} className="flex gap-3 rounded-lg bg-slate-50 p-3">
            {scene.timestamp && (
              <span className="shrink-0 rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-mono font-bold text-white">
                {scene.timestamp}
              </span>
            )}
            <div className="min-w-0">
              {scene.scene && <p className="text-[12px] font-semibold text-slate-700">{scene.scene}</p>}
              {scene.narration && <p className="mt-0.5 text-[12px] text-slate-600 italic">"{scene.narration}"</p>}
              {scene.action && <p className="mt-0.5 text-[11px] text-slate-500">{scene.action}</p>}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (typeof script === "object") {
    return (
      <div className="space-y-2">
        {Object.entries(script).map(([key, val]) => (
          <div key={key} className="flex gap-3 rounded-lg bg-slate-50 p-3">
            <span className="shrink-0 rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-mono font-bold text-white">
              {key}
            </span>
            <p className="text-[12px] leading-relaxed text-slate-700">{String(val)}</p>
          </div>
        ))}
      </div>
    );
  }

  return null;
}

function parseScriptText(script: string): Array<{ time: string; line: string }> {
  const lines = script.split("\n").filter(Boolean);
  return lines.map((line, i) => {
    const match = line.match(/^\[?(\d+[-–]\d+s?)\]?\s*(.+)/);
    if (match) return { time: match[1], line: match[2] };
    return { time: `Scene ${i + 1}`, line };
  });
}

interface VideoConceptCardProps {
  concept: VideoConcept;
  index: number;
  imageUrls?: string[];
}

export function VideoConceptCard({ concept, index, imageUrls }: VideoConceptCardProps) {
  const [open, setOpen] = useState(index === 0);

  const title = concept.title || concept.concept_title || concept.headline || `Video Concept ${index + 1}`;
  const format = concept.format || "Short-form reel";
  const duration = concept.duration || "30-60s";
  const hook = concept.hook || "";
  const visual = concept.visual_direction || "";
  const voiceover = concept.voiceover || "";
  const musicVibe = concept.music_vibe || "";
  const cta = concept.cta || "";
  const platform = concept.platform || "Instagram / YouTube";
  const keyMessage = concept.key_message || "";

  const hasScriptBreakdown = concept.script_breakdown !== undefined;
  const hasRawScript = typeof concept.script === "string" && concept.script.length > 0;
  const parsedScript = hasRawScript ? parseScriptText(concept.script as string) : [];

  const heroImage = imageUrls?.[index % (imageUrls?.length || 1)];

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md">
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-start gap-4 px-5 py-4 text-left hover:bg-slate-50/70 transition"
      >
        {/* Number badge */}
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 text-base font-bold text-white shadow-md shadow-rose-200">
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Clapperboard size={14} className="text-rose-500" />
            <h3 className="text-[15px] font-bold text-slate-900">{title}</h3>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700">
              <Film size={9} />{format}
            </span>
            <span className="flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
              <Clock size={9} />{duration}
            </span>
            <span className="rounded-md bg-violet-50 px-2 py-0.5 text-[10px] font-medium text-violet-700">
              {platform}
            </span>
          </div>
        </div>
        <ChevronDown size={18} className={`mt-1 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-slate-100">
          {/* Hero image / thumbnail placeholder */}
          {heroImage ? (
            <div className="relative bg-black">
              <img src={heroImage} alt="" className="w-full object-cover opacity-90" style={{ maxHeight: 280 }} />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="rounded-full border-2 border-white/80 bg-black/50 p-4 backdrop-blur-sm">
                  <Play size={28} className="fill-white text-white" />
                </div>
              </div>
              <div className="absolute bottom-2 right-2 rounded-md bg-black/70 px-2 py-1 text-[11px] font-bold text-white">
                {duration}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900" style={{ height: 180 }}>
              <div className="text-center">
                <Play size={40} className="fill-white/20 text-white/40 mx-auto mb-2" />
                <p className="text-[12px] font-medium text-white/50">{format} · {duration}</p>
              </div>
            </div>
          )}

          <div className="space-y-5 p-5">
            {/* Hook */}
            {hook && (
              <div className="flex gap-3 rounded-xl border border-orange-100 bg-gradient-to-r from-orange-50 to-amber-50/60 p-4">
                <Zap size={16} className="mt-0.5 shrink-0 text-orange-500" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-orange-700">Opening Hook</p>
                  <p className="mt-1 text-[13px] font-semibold italic text-orange-950">"{hook}"</p>
                </div>
              </div>
            )}

            {/* Key message */}
            {keyMessage && (
              <div className="flex gap-3 rounded-xl border border-violet-100 bg-violet-50/60 p-4">
                <Target size={16} className="mt-0.5 shrink-0 text-violet-600" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-violet-700">Key Message</p>
                  <p className="mt-1 text-[13px] text-violet-950">{keyMessage}</p>
                </div>
              </div>
            )}

            {/* Script breakdown */}
            {hasScriptBreakdown && (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Layers size={14} className="text-slate-500" />
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Script Breakdown</p>
                </div>
                <ScriptBreakdown script={concept.script_breakdown} />
              </div>
            )}

            {/* Raw script */}
            {!hasScriptBreakdown && hasRawScript && parsedScript.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Layers size={14} className="text-slate-500" />
                  <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Script</p>
                </div>
                <div className="space-y-2">
                  {parsedScript.map((line, i) => (
                    <div key={i} className="flex gap-3 rounded-lg bg-slate-50 p-3">
                      <span className="shrink-0 rounded-md bg-slate-800 px-2 py-0.5 text-[10px] font-mono font-bold text-white">
                        {line.time}
                      </span>
                      <p className="text-[12px] leading-relaxed text-slate-700">{line.line}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Visual direction */}
            {visual && (
              <div className="flex gap-3 rounded-xl border border-teal-100 bg-teal-50/60 p-4">
                <Film size={16} className="mt-0.5 shrink-0 text-teal-600" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-teal-700">Visual Direction</p>
                  <p className="mt-1 text-[13px] text-teal-950">{visual}</p>
                </div>
              </div>
            )}

            {/* Voiceover */}
            {voiceover && (
              <div className="flex gap-3 rounded-xl border border-indigo-100 bg-indigo-50/60 p-4">
                <Mic2 size={16} className="mt-0.5 shrink-0 text-indigo-600" />
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-700">Voiceover / Script</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-indigo-950 italic">"{voiceover}"</p>
                </div>
              </div>
            )}

            {/* Music + CTA row */}
            <div className="flex flex-wrap gap-3">
              {musicVibe && (
                <div className="flex-1 min-w-[160px] rounded-xl border border-pink-100 bg-pink-50/60 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-pink-700">Music Vibe</p>
                  <p className="mt-1 text-[13px] text-pink-950">🎵 {musicVibe}</p>
                </div>
              )}
              {cta && (
                <div className="flex-1 min-w-[160px] rounded-xl border border-green-100 bg-green-50/60 px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-green-700">Call to Action</p>
                  <p className="mt-1 text-[13px] font-bold text-green-950">"{cta}"</p>
                </div>
              )}
            </div>

            {/* Concept diagram: visual flow */}
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Sparkles size={14} className="text-indigo-500" />
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-500">Concept Flow</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { label: "Hook", color: "bg-orange-500", time: "0–3s" },
                  { label: "Problem", color: "bg-red-500", time: "3–10s" },
                  { label: "Solution", color: "bg-indigo-500", time: "10–20s" },
                  { label: "Proof", color: "bg-teal-500", time: "20–25s" },
                  { label: "CTA", color: "bg-green-500", time: "25–30s" },
                ].map((step, i, arr) => (
                  <div key={step.label} className="flex items-center gap-2">
                    <div className={`rounded-xl px-3 py-2 text-white shadow-sm ${step.color}`}>
                      <p className="text-[10px] font-bold uppercase">{step.label}</p>
                      <p className="text-[9px] opacity-80">{step.time}</p>
                    </div>
                    {i < arr.length - 1 && (
                      <div className="text-slate-300">→</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
