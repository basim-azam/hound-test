import React, { useEffect, useMemo, useRef, useState } from "react";

type Step = "upload" | "consent" | "processing" | "result" | "resultOverlay";
type OverlayPoint = { x:number; y:number; color:string };

export default function App(){
  const [step,setStep]=useState<Step>("upload");
  const [file,setFile]=useState<File|null>(null);
  const [consent,setConsent]=useState(false);
  const [processing,setProcessing]=useState(0);
  const [score,setScore]=useState(1);
  const [message,setMessage]=useState("Analysis complete");
  const [overlay,setOverlay]=useState<OverlayPoint[]>([]);
  const [frameB64,setFrameB64]=useState<string|null>(null);
  const [metrics,setMetrics]=useState<any>(null);

  const onChoose:React.ChangeEventHandler<HTMLInputElement>=e=>{
    const f=e.target.files?.[0]; if(!f) return;
    if(!f.type.startsWith("video/")){ alert("Please upload a video file."); return; }
    setFile(f); setConsent(false); setStep("consent");
  };

  async function start(){
    if(!file) return;
    setStep("processing"); setProcessing(0); setMessage("Uploading…");

    const xhr=new XMLHttpRequest();
    const fd=new FormData(); fd.append("video", file); fd.append("withers_cm","55");
    xhr.open("POST","/api/analyze");
    xhr.upload.onprogress=(e)=>{ if(e.lengthComputable){ setProcessing(Math.min(99, (e.loaded/e.total)*90)); } };
    xhr.onerror=()=>{ setMessage("Network error during upload."); setStep("result"); };
    xhr.onload=()=>{
      try{
        const data=JSON.parse(xhr.responseText);
        if(xhr.status>=200 && xhr.status<300){
          setScore(typeof data.score==="number"?data.score:1);
          setMessage(data.recommendation || "Analysis complete");
          setOverlay(Array.isArray(data.overlay_points)?data.overlay_points:[]);
          setFrameB64(data.frame_jpeg_b64 || null);
          setMetrics(data.metrics || null);
        }else{
          setMessage(`Server error (${xhr.status}): ${data.error || xhr.responseText}`);
        }
      }catch(e){ setMessage("Invalid server response."); }
      setProcessing(100); setStep("result");
    };
    xhr.send(fd);
  }

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-[#D5DCC3] to-[#A7B08A] text-slate-800">
      <header className="mx-auto flex w-full max-w-[1100px] items-center justify-between px-6 py-6">
        <h1 className="text-2xl font-semibold tracking-tight">Hound Forward</h1>
        <span className="rounded-full bg-white/80 px-3 py-1 text-xs shadow">Clinical-calm &amp; trustworthy</span>
      </header>

      <main className="mx-auto w-full max-w-[1100px] px-6 pb-24">
        {step==="upload" && (
          <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-lg backdrop-blur">
            <div className="flex h-[420px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300">
              <p className="mb-2 text-2xl font-semibold">Upload a video</p>
              <p className="mb-6 text-slate-600">Drag or paste a file here, or choose an option below.</p>
              <label htmlFor="file" className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-[#6C63FF] px-5 py-3 text-white shadow hover:shadow-md">
                Choose File
              </label>
              <input id="file" type="file" accept="video/*" className="sr-only" onChange={onChoose}/>
            </div>
          </section>
        )}

        {step==="consent" && (
          <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-lg backdrop-blur">
            <label className="flex items-start gap-3">
              <input type="checkbox" className="mt-1 h-5 w-5 rounded border-slate-300 text-[#6C63FF]" checked={consent} onChange={e=>setConsent(e.target.checked)} />
              <span className="text-sm leading-6 text-slate-700">
                By uploading a video, you confirm permission to share it and agree to processing for gait analysis results.
              </span>
            </label>
            <div className="mt-4">
              <button disabled={!consent} onClick={start} className={`rounded-full px-6 py-3 text-white ${consent?"bg-[#6C63FF]":"bg-[#6C63FF]/50 cursor-not-allowed"}`}>
                Upload
              </button>
            </div>
          </section>
        )}

        {step==="processing" && (
          <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-lg backdrop-blur">
            <div className="relative h-8 w-full overflow-hidden rounded-full bg-slate-200/70">
              <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-500 via-lime-500 to-green-600 transition-[width]" style={{width: processing+"%"}} />
              <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-white">Analysing ▶▶</div>
            </div>
            <p className="mt-3 text-sm text-slate-700">{message}</p>
          </section>
        )}

        {step==="result" && (
          <section className="rounded-2xl border border-slate-200/70 bg-white/80 p-6 shadow-lg backdrop-blur">
            <HeroFrame frameB64={frameB64} overlay={overlay}/>

            <div className="mt-6"><ResultMeter score={score} min={0} max={5} /></div>

            <div className="mt-4 space-y-1">
              <p className="text-xl font-bold">Your Dog’s Score: {Number(score).toFixed(1)}</p>
              <p className="text-slate-800">{message}</p>
            </div>

            {metrics && <MetricsGrid metrics={metrics}/>}

            <p className="mt-5 text-sm text-slate-600">This tool provides informational insights only and is not a veterinary diagnosis. If you have concerns about your dog’s gait, please consult a qualified veterinarian.</p>

            <div className="mt-6">
              <button onClick={()=>{ setStep("upload"); setFile(null); setConsent(false); setProcessing(0); setOverlay([]); setFrameB64(null); setMetrics(null);} } className="rounded-full bg-[#6C63FF] px-6 py-3 text-white shadow">Analyze another video</button>
            </div>
          </section>
        )}
      </main>

      <footer className="mx-auto w-full max-w-[1100px] px-6 pb-8 text-xs text-slate-700">© {new Date().getFullYear()} Hound Forward</footer>
    </div>
  );
}

function HeroFrame({frameB64, overlay}:{frameB64:string|null; overlay:OverlayPoint[]}){
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-inner">
      {frameB64 ? (
        <img src={`data:image/jpeg;base64,${frameB64}`} alt="analysis frame" className="h-full w-full object-cover"/>
      ) : (
        <div className="flex h-full items-center justify-center text-slate-500">No frame available</div>
      )}
      {frameB64 && overlay && overlay.map((p,i)=>(
        <span key={i} className="pointer-events-none absolute h-3 w-3 -translate-x-1.5 -translate-y-1.5 rounded-full ring-2 ring-white/90 shadow" style={{ left:`${p.x*100}%`, top:`${p.y*100}%`, backgroundColor:p.color }} />
      ))}
    </div>
  );
}

function MetricsGrid({metrics}:{metrics:any}){
  const Card = (p:{label:string; value:string}) => (
    <div className="rounded-xl border border-slate-200 bg-white/80 p-3 shadow-sm">
      <div className="text-xs text-slate-600">{p.label}</div>
      <div className="text-lg font-semibold">{p.value}</div>
    </div>
  );
  return (
    <div className="mt-6 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
      <Card label="Cadence (Hz)" value={Number(metrics.cadence_hz).toFixed(2)} />
      <Card label="Stride time (s)" value={Number(metrics.stride_time_s).toFixed(2)} />
      <Card label="LR symmetry index" value={Number(metrics.symmetry_index?.left_right).toFixed(1)} />
      <Card label="TB symmetry index" value={Number(metrics.symmetry_index?.top_bottom).toFixed(1)} />
      <Card label="Speed (px/s)" value={Number(metrics.speed_px_s).toFixed(1)} />
      <Card label="Stride length (px est.)" value={Number(metrics.stride_length_px_est).toFixed(1)} />
    </div>
  );
}

function ResultMeter({ score, min, max }: { score: number; min: number; max: number }) {
  const ticks = useMemo(() => Array.from({ length: max - min + 1 }, (_, i) => i + min), [min, max]);
  const clamp = (v:number)=> Math.max(0, Math.min(100, v));
  const pct = clamp(((score - min) / (max - min)) * 100);

  return (
    <div className="w-full">
      <div className="relative">
        <svg viewBox="0 0 100 22" className="block h-14 w-full" preserveAspectRatio="none">
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
      <div className="mt-1 flex justify-between px-1 text-xs text-slate-700">
        <span>0</span><span>5</span>
      </div>
    </div>
  );
}
