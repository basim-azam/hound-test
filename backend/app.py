
from fastapi import FastAPI, APIRouter, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from pathlib import Path
from tempfile import NamedTemporaryFile
import numpy as np
import pandas as pd

api = APIRouter(prefix="/api")

@api.get("/health")
def health():
    return {"status": "ok"}

def compute_metrics_from_tracks(df: pd.DataFrame, fps: float):
    def find_minima(y, win=5):
        y = pd.Series(y).rolling(win, center=True).mean().values
        idx = []
        for i in range(win, len(y)-win):
            window = y[i-win:i+win+1]
            if np.isfinite(y[i]) and y[i] == np.nanmin(window):
                idx.append(i)
        return np.array(idx, dtype=int)

    paws = ["LF","RF","LH","RH"]
    events = {}
    for paw in paws:
        y = df.get(f"paw_{paw}.y", pd.Series(np.nan*np.zeros(len(df)))).values
        idx = find_minima(y, win=5)
        events[f"{paw}_footstrike"] = (idx / fps).tolist()

    duty = {}
    for paw in paws:
        y = df.get(f"paw_{paw}.y", pd.Series(np.nan*np.zeros(len(df)))).values
        med = np.nanmedian(y)
        duty[paw] = float(np.nanmean(y <= med))

    def symmetry_index(a, b):
        return float(100.0 * abs(a - b) / ((a + b)/2.0)) if np.isfinite(a) and np.isfinite(b) and (a+b)!=0 else float("nan")

    si_fore = symmetry_index(duty["LF"], duty["RF"])
    si_hind = symmetry_index(duty["LH"], duty["RH"])
    gsa = float(np.nanmean([si_fore, si_hind]))

    if not np.isfinite(gsa): score = 0.0
    elif gsa < 5: score = 5.0
    elif gsa < 10: score = 3.5
    elif gsa < 20: score = 2.0
    else: score = 1.0

    return {
        "duty_factor": duty,
        "symmetry_index": {"forelimb": si_fore, "hindlimb": si_hind},
        "gsa": gsa,
        "score": score
    }, events

@api.post("/analyze")
async def analyze(
    video: UploadFile = File(...),
    withers_cm: float = Form(50.0),
    breed: str = Form(""),
    age: str = Form(""),
    conditions: str = Form("")
):
    with NamedTemporaryFile(delete=False, suffix=Path(video.filename).suffix) as tmp:
        data = await video.read()
        tmp.write(data)
        video_path = Path(tmp.name)

    n, fps = 600, 30.0
    t = np.arange(n)/fps
    df = pd.DataFrame({
        "paw_LF.y": 120 + 10*np.sin(2*np.pi*1.0*t + 0.1),
        "paw_RF.y": 120 + 10*np.sin(2*np.pi*1.0*t + 3.3),
        "paw_LH.y": 130 +  8*np.sin(2*np.pi*1.0*t + 0.9),
        "paw_RH.y": 130 +  8*np.sin(2*np.pi*1.0*t + 3.8),
    })

    metrics, events = compute_metrics_from_tracks(df, fps=fps)
    payload = {
        "score": metrics["score"],
        "flags": ["left_forelimb_asymmetry"] if metrics["symmetry_index"]["forelimb"]>10 else [],
        "recommendation": "Consult veterinarian for physical examination" if metrics["score"]<=2 else "Monitor at home",
        "metrics": metrics,
        "events": events
    }
    return JSONResponse(payload)

def create_app():
    app = FastAPI(title="Hound Forward (Unified)", version="0.1.0")
    # For production same-origin, CORS not strictly needed; keep for safety
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
    app.include_router(api)
    # Serve pre-built frontend (copied to ./frontend_dist at build time)
    static_dir = Path(__file__).parent / "frontend_dist"
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
    return app

app = create_app()
