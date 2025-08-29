import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * Hound Forward – Single-file React + Tailwind UI (wired to /api/analyze)
 * States: upload | consent | processing | result | resultOverlay
 */

export default function App() {
  type Step = "upload" | "consent" | "processing" | "result" | "resultOverlay";

  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);

  // Consent & dog meta
  const [consent, setConsent] = useState(false);
  const [breed, setBreed] = useState("");
  const [age, setAge] = useState("");
  const [withers, setWithers] = useState<string>("");
  const [conditions, setConditions] = useState<string[]>([]);

  // Processing
  const [processing, setProcessing] = useState(0);

  // API result
  const [score, setScore] = useState<number>(1);
  const [finding, setFinding] = useState<string>("Left forelimb asymmetry elevated");
  const [recommendation, setRecommendation] = useState<string>("Consult veterinarian for physical examination");

  // Extracted frame (client-side) for overlay
  const [frameURL, setFrameURL] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);

  // --------- Handlers ---------
  const onChooseFile: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!f.type.startsWith("video/")) {
      alert("Please upload a video file.");
      return;
    }
    setFile(f);
    setConsent(false);
    setStep("consent");
  };

  async function onStartAnalysis() {
    if (!file) return;
    // start UI progress immediately
    setProcessing(0);
    setStep("processing");

    // progress animation
    const start = performance.now();
    const duration = 2500;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(100, ((t - start) / duration) * 100);
      setProcessing(p);
      if (p < 100) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // call API
    const fd = new FormData();
    fd.append("video", file);
    fd.append("withers_cm", withers || "50");
    fd.append("breed", breed);
    fd.append("age", age);
    fd.append("conditions", conditions.join(","));
    try {
      const res = await fetch("/api/analyze", { method: "POST", body: fd });
      const data = await res.json();
      // update UI from backend
      if (typeof data.score === "number") setScore(data.score);
      if (Array.isArray(data.flags) && data.flags.includes("left_forelimb_asymmetry")) {
        setFinding("Left forelimb asymmetry elevated");
      } else {
        setFinding("No significant asymmetry detected");
      }
      setRecommendation(data.recommendation || "Monitor at home");

      // extract a display frame locally
      setExtracting(true);
      const url = await extractFrameReliable(file);
      setFrameURL(url);
      setExtracting(false);
      setStep("result");
    } catch (e) {
      console.error(e);
      setRecommendation("Upload failed — try again");
      setStep("result");
    } finally {
      cancelAnimationFrame(raf);
      setProcessing(100);
    }
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-[#D5DCC3] to-[#A7B08A] text-slate-800">
      <header className="mx-auto flex w-full max-w-[1100px] items-center justify-between px-6 py-6">
        <h1 className="text-2xl font-semibold tracking-tight">Hound Forward</h1>
        <span className="rounded-full bg-white/80 px-3 py-1 text-xs shadow">Clinical-calm &amp; trustworthy</span>
      </header>

      <main className="mx-auto w-full max-w-[1100px] px-6 pb-24">
        {/* Upload */}
        {step === "upload" && (
          <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-lg backdrop-blur">
            <div className="flex h-[420px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300">
              <CloudUploadIcon className="mb-4 h-14 w-14 text-slate-500" />
              <p className="mb-2 text-2xl font-semibold">Upload a video</p>
              <p className="mb-6 text-slate-600">Drag or paste a file here, or choose an option below.</p>
              <label htmlFor="file-input" className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-[#6C63FF] px-5 py-3 text-white shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#6C63FF]/60">
                <ImageIcon className="h-5 w-5" />
                Choose File
              </label>
              <input id="file-input" type="file" accept="video/*" onChange={onChooseFile} className="sr-only" />
            </div>
          </section>
        )}

        {/* Consent */}
        {step === "consent" && (
          <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-lg backdrop-blur">
            <div className="aspect-video w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-inner">
              <div className="flex h-full items-center justify-center text-slate-400">16:9 hero image placeholder</div>
            </div>

            <div className="mt-6 space-y-4">
              <label className="flex items-start gap-3">
                <input type="checkbox" className="mt-1 h-5 w-5 rounded border-slate-300 text-[#6C63FF] focus:ring-[#6C63FF]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span className="text-sm leading-6 text-slate-700">
                  By uploading a video, you confirm that you are the owner or have permission to share it. You grant Hound Forward the right to process this video to provide gait analysis results and to improve our service. Videos may be stored securely for quality assurance, training, and research purposes.
                  <br/><br/>
                  Your video will not be shared publicly without your explicit consent. You can request deletion of your video at any time by contacting us. By continuing, you agree that your video will be handled in line with our Privacy Policy (to be provided before public launch).
                </span>
              </label>

              <div className="grid gap-3 md:grid-cols-4">
                <Field label="Breed">
                  <select className="w-full rounded-xl border border-slate-300 p-3 focus:border-[#6C63FF] focus:outline-none focus:ring-2 focus:ring-[#6C63FF]/40" value={breed} onChange={(e) => setBreed(e.target.value)}>
                    <option value="">Select…</option>
                    <option>Border Collie</option>
                    <option>German Shepherd</option>
                    <option>Labrador Retriever</option>
                    <option>Golden Retriever</option>
                    <option>Other</option>
                  </select>
                </Field>
                <Field label="Age">
                  <select className="w-full rounded-xl border border-slate-300 p-3 focus:border-[#6C63FF] focus:outline-none focus:ring-2 focus:ring-[#6C63FF]/40" value={age} onChange={(e) => setAge(e.target.value)}>
                    <option value="">Select…</option>
                    <option>Puppy (0–1)</option>
                    <option>Adult (2–7)</option>
                    <option>Senior (8+)</option>
                  </select>
                </Field>
                <Field label="Withers Height (cm)">
                  <input type="number" min={0} className="w-full rounded-xl border border-slate-300 p-3 focus:border-[#6C63FF] focus:outline-none focus:ring-2 focus:ring-[#6C63FF]/40" value={withers} onChange={(e) => setWithers(e.target.value)} placeholder="e.g., 55" />
                </Field>
                <Field label="Conditions">
                  <select multiple className="h-[52px] w-full rounded-xl border border-slate-300 p-3 focus:border-[#6C63FF] focus:outline-none focus:ring-2 focus:ring-[#6C63FF]/40" onChange={(e) => setConditions(Array.from(e.target.selectedOptions).map((o) => o.value))}>
                    <option value="none">none</option>
                    <option value="previous injury">previous injury</option>
                    <option value="arthritis">arthritis</option>
                  </select>
                </Field>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button disabled={!consent || !file} onClick={onStartAnalysis} className={`rounded-full px-6 py-3 text-white shadow transition focus:outline-none focus:ring-2 focus:ring-[#6C63FF]/60 ${consent && file ? "bg-[#6C63FF] hover:shadow-md" : "cursor-not-allowed bg-[#6C63FF]/50"}`}>
                  Upload
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Processing */}
        {step === "processing" && (
          <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-lg backdrop-blur">
            <div className="-mx-6">
              <div className="relative h-8 w-[calc(100%+3rem)] overflow-hidden rounded-full bg-slate-200/70" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(processing)}>
                <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-500 via-lime-500 to-green-600 transition-[width]" style={{ width: `${processing}%` }} />
                <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-white mix-blend-difference">Analysing ▶▶</div>
              </div>
            </div>
            <p className="mt-4 text-sm text-slate-700">We’re tracking and analysing your dog’s limbs and estimating stride and symmetry…</p>
            <div className="mt-4">
              <button onClick={() => { setStep("upload"); setFile(null); setProcessing(0); }} className="rounded-full border border-slate-300 bg-white/90 px-6 py-3 text-slate-700 shadow-sm transition hover:shadow focus:outline-none focus:ring-2 focus:ring-slate-400/50">Cancel</button>
            </div>
          </section>
        )}

        {/* Results & Overlay */}
        {(step === "result" || step === "resultOverlay") && (
          <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-lg backdrop-blur">
            {step === "result" ? (
              <FrameWithKeypoints src={frameURL || undefined} extracting={extracting} />
            ) : (
              <VideoWithOverlay file={file} />
            )}

            <div className="mt-6">
              <ResultMeter score={score} min={0} max={5} />
            </div>

            <div className="mt-4 space-y-1">
              <p className="text-xl font-bold">Your Dog’s Score: {score}</p>
              <p className="text-slate-800">{finding}</p>
              <p className="text-slate-800">{recommendation}</p>
            </div>

            <p className="mt-5 text-sm text-slate-600">This tool provides informational insights only and is not a veterinary diagnosis. If you have concerns about your dog’s gait, please consult a qualified veterinarian.</p>

            <div className="mt-6 flex flex-wrap gap-3">
              {step === "result" ? (
                <button onClick={() => setStep("resultOverlay")} className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/90 px-5 py-3 text-slate-800 shadow-sm transition hover:shadow focus:outline-none focus:ring-2 focus:ring-slate-400/50">
                  <PlayIcon className="h-5 w-5" />
                  Show keypoint overlay
                </button>
              ) : (
                <button onClick={() => setStep("result")} className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white/90 px-5 py-3 text-slate-800 shadow-sm transition hover:shadow focus:outline-none focus:ring-2 focus:ring-slate-400/50">Hide overlay</button>
              )}
              <button onClick={() => { setStep("upload"); setFile(null); setConsent(false); setProcessing(0); setFrameURL(null); }} className="rounded-full bg-[#6C63FF] px-6 py-3 text-white shadow transition hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#6C63FF]/60">Analyze another video</button>
            </div>
          </section>
        )}
      </main>

      <footer className="mx-auto w-full max-w-[1100px] px-6 pb-8 text-xs text-slate-700">© {new Date().getFullYear()} Hound Forward</footer>
    </div>
  );
}

/* -------------------------- Subcomponents -------------------------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function FrameWithKeypoints({ src, extracting }: { src?: string; extracting?: boolean }) {
  const keypoints = [
    { x: 0.18, y: 0.40, color: "#E35D5D" }, // left shoulder (elevated)
    { x: 0.25, y: 0.55, color: "#E35D5D" }, // left elbow
    { x: 0.60, y: 0.36, color: "#2FB36D" }, // spine
    { x: 0.80, y: 0.44, color: "#2FB36D" }, // right hip
    { x: 0.86, y: 0.62, color: "#2FB36D" }, // right knee
  ];

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-inner">
      {src ? (
        <img src={src} alt="analysis frame" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-slate-500">
          {extracting ? "Extracting frame…" : "No frame available"}
        </div>
      )}
      {src && (
        <div className="pointer-events-none absolute inset-0">
          {keypoints.map((p, i) => (
            <span key={i} className="absolute h-3 w-3 -translate-x-1.5 -translate-y-1.5 rounded-full ring-2 ring-white/90 shadow" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, backgroundColor: p.color }} />
          ))}
        </div>
      )}
    </div>
  );
}

function VideoWithOverlay({ file }: { file: File | null }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1.0);

  const toggle = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); }
  };

  useEffect(() => { const v = videoRef.current; if (v) v.playbackRate = speed; }, [speed]);

  // dummy points
  const points = [
    { x: 0.18, y: 0.40, color: "#E35D5D" },
    { x: 0.25, y: 0.55, color: "#E35D5D" },
    { x: 0.60, y: 0.36, color: "#2FB36D" },
    { x: 0.80, y: 0.44, color: "#2FB36D" },
    { x: 0.86, y: 0.62, color: "#2FB36D" },
  ];

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-inner">
      {file ? (
        <video ref={videoRef} className="h-full w-full object-cover" src={URL.createObjectURL(file)} muted playsInline aria-label="Result video" onClick={toggle} />
      ) : (
        <div className="flex h-full items-center justify-center text-slate-500">No video</div>
      )}

      <div className="pointer-events-none absolute inset-0">
        {points.map((p, i) => (
          <span key={i} className="absolute h-3 w-3 -translate-x-1.5 -translate-y-1.5 rounded-full ring-2 ring-white/90 shadow" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, backgroundColor: p.color }} />
        ))}
      </div>

      <button onClick={toggle} className="absolute left-4 top-4 inline-flex items-center justify-center rounded-full bg-white/90 p-3 text-slate-800 shadow focus:outline-none focus:ring-2 focus:ring-slate-400/60">
        {playing ? <PauseIcon className="h-6 w-6" /> : <PlayIcon className="h-6 w-6" />}
        <span className="sr-only">{playing ? "Pause" : "Play"}</span>
      </button>

      <div className="absolute left-4 bottom-4 rounded-full bg-white/90 px-3 py-2 text-sm text-slate-800 shadow">
        <span className="mr-2 text-slate-600">Playback speed –</span>
        {[1.0, 0.5, 0.25].map((s) => (
          <button key={s} onClick={() => setSpeed(s)} className={`mx-1 rounded-full px-2 py-1 focus:outline-none focus:ring-2 focus:ring-slate-400/60 ${speed === s ? "bg-slate-800 text-white" : "bg-white text-slate-800 border border-slate-300"}`}>{s}</button>
        ))}
      </div>
    </div>
  );
}

function ResultMeter({ score, min, max }: { score: number; min: number; max: number }) {
  const ticks = useMemo(() => Array.from({ length: max - min + 1 }, (_, i) => i + min), [min, max]);
  const pct = ((score - min) / (max - min)) * 100;

  return (
    <div className="w-full">
      {/* Full-bleed meter to match design */}
      <div className="relative -mx-6 select-none">
        <svg viewBox="0 0 100 22" className="block h-14 w-[calc(100%+3rem)]" preserveAspectRatio="none">
          <defs>
            <linearGradient id="meterGrad" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#D84E4E" />
              <stop offset="50%" stopColor="#E9A23B" />
              <stop offset="100%" stopColor="#2FB36D" />
            </linearGradient>
          </defs>
          <rect x="0" y="6" width="100" height="10" rx="5" fill="url(#meterGrad)" />
          {ticks.map((t) => {
            const x = (t / (max - min)) * 100;
            return (
              <g key={t}>
                <line x1={x} y1="4" x2={x} y2="18" stroke="white" strokeWidth="0.8" opacity="0.95" />
                <line x1={x - 2} y1="8" x2={x - 2} y2="14" stroke="white" strokeWidth="0.4" opacity="0.6" />
                <line x1={x + 2} y1="8" x2={x + 2} y2="14" stroke="white" strokeWidth="0.4" opacity="0.6" />
              </g>
            );
          })}
          <polygon points={`${pct},2 ${pct - 2.8},6 ${pct + 2.8},6`} fill="#ffffff" />
        </svg>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold text-white/95">
          Analysis complete
        </div>
      </div>
      <div className="-mx-6 mt-1 flex justify-between px-2 text-xs text-slate-700">
        <span>0</span>
        {ticks.slice(1, -1).map((t) => (<span key={t} className="opacity-0">{t}</span>))}
        <span>5</span>
      </div>
    </div>
  );
}

/* ------------------------------ Icons ------------------------------ */
function CloudUploadIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props} aria-hidden>
      <path d="M7 18a5 5 0 0 1 0-10 6 6 0 0 1 11.3-1.9A4.5 4.5 1 1 1 21 18H7Z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 14V8m0 0-3 3m3-3 3 3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function ImageIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" {...props} aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="9" cy="10" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4 17l5-5 3 3 4-4 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function PlayIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props} aria-hidden>
      <path d="M8 5v14l11-7-11-7z" />
    </svg>
  );
}
function PauseIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props} aria-hidden>
      <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
    </svg>
  );
}

/* --------------------------- Utilities --------------------------- */
async function extractFrameReliable(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.src = url;
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;

    const cleanup = () => URL.revokeObjectURL(url);

    const draw = () => {
      try {
        const canvas = document.createElement("canvas");
        const w = video.videoWidth || 640;
        const h = video.videoHeight || 360;
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(video, 0, 0, w, h);
        const data = canvas.toDataURL("image/png");
        cleanup();
        resolve(data);
      } catch { cleanup(); resolve(null); }
    };

    video.onloadedmetadata = () => {
      const target = isFinite(video.duration) && video.duration > 1 ? Math.min(video.duration/3, 2) : 0.5;
      const onSeeked = () => { draw(); video.removeEventListener("seeked", onSeeked); };
      video.addEventListener("seeked", onSeeked);
      try { video.currentTime = target; } catch { video.addEventListener("canplay", draw, { once: true }); }
    };

    video.onerror = () => { cleanup(); resolve(null); };
  });
}
