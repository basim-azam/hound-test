
import os, io, base64, logging
from pathlib import Path
from tempfile import NamedTemporaryFile

import cv2
import numpy as np
import pandas as pd
from scipy.ndimage import gaussian_filter1d
from scipy.signal import find_peaks

from fastapi import FastAPI, APIRouter, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

MAX_UPLOAD_MB = float(os.getenv("MAX_UPLOAD_MB", "30"))

log = logging.getLogger("hf")
logging.basicConfig(level=logging.INFO)

api = APIRouter(prefix="/api")

@api.get("/health")
def health():
    return {"status": "ok"}

def encode_jpeg(img_bgr, quality=85):
    ok, buf = cv2.imencode(".jpg", img_bgr, [int(cv2.IMWRITE_JPEG_QUALITY), quality])
    if not ok:
        return None
    return base64.b64encode(buf.tobytes()).decode("ascii")

def local_minima(y, distance=4, prominence=0.0):
    y = np.asarray(y, dtype=np.float32)
    inv = -(y - np.nanmedian(y))
    idx, _ = find_peaks(inv, distance=distance, prominence=prominence)
    return idx

def analyze_cv(video_path: Path, target_fps: float = 12.0):
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError("Cannot open video")
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    step = max(1, int(round(src_fps / target_fps)))

    fgbg = cv2.createBackgroundSubtractorMOG2(history=300, varThreshold=25, detectShadows=False)

    left_energy, right_energy = [], []
    top_energy, bottom_energy = [], []
    bbox_pixels = None

    prev_gray = None
    speed_px_accum = 0.0
    speed_samples = 0

    sampled_frames = []
    idx = -1
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        idx += 1
        if idx % step != 0:
            continue

        h, w = frame.shape[:2]
        scale = 768.0 / max(h, w)
        frame = cv2.resize(frame, (int(w*scale), int(h*scale)))
        h, w = frame.shape[:2]
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        mask = fgbg.apply(gray)
        mask = cv2.medianBlur(mask, 5)
        # approximate dog bbox from largest contour of mask
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if contours:
            c = max(contours, key=cv2.contourArea)
            x,y,bw,bh = cv2.boundingRect(c)
            if bw*bh > 0.02*w*h:  # ignore tiny
                bbox_pixels = (x,y,bw,bh)

        mid_x = w//2
        mid_y = h//2
        left_energy.append(float(mask[:, :mid_x].mean()))
        right_energy.append(float(mask[:, mid_x:].mean()))
        top_energy.append(float(mask[:mid_y, :].mean()))
        bottom_energy.append(float(mask[mid_y:, :].mean()))

        if prev_gray is not None:
            flow = cv2.calcOpticalFlowFarneback(prev_gray, gray, None, 0.5, 3, 25, 3, 5, 1.2, 0)
            fx = flow[...,0]
            if bbox_pixels is not None:
                x,y,bw,bh = bbox_pixels
                region = fx[max(0,y):min(h,y+bh), max(0,x):min(w,x+bw)]
            else:
                region = fx
            speed_px_accum += float(np.nanmedian(region))
            speed_samples += 1

        prev_gray = gray
        if len(sampled_frames) < 1:
            sampled_frames.append(frame.copy())

    cap.release()

    le = np.asarray(left_energy, dtype=np.float32)
    re = np.asarray(right_energy, dtype=np.float32)
    te = np.asarray(top_energy, dtype=np.float32)
    be = np.asarray(bottom_energy, dtype=np.float32)

    if len(le) < 8:
        raise RuntimeError("Not enough frames for analysis. Try a longer clip.")

    fs = target_fps
    le_s = gaussian_filter1d(le, 2); re_s = gaussian_filter1d(re, 2)
    te_s = gaussian_filter1d(te, 2); be_s = gaussian_filter1d(be, 2)

    # Cadence from band-limited FFT on total energy
    sig = gaussian_filter1d((le_s + re_s), 2)
    freqs = np.fft.rfftfreq(len(sig), d=1.0/fs)
    amp   = np.abs(np.fft.rfft(sig - sig.mean()))
    band  = (freqs >= 0.3) & (freqs <= 3.0)  # walk/trot
    cadence_hz = float(freqs[band][np.argmax(amp[band])]) if band.any() else float("nan")
    stride_time = float(1.0 / cadence_hz) if np.isfinite(cadence_hz) and cadence_hz>0 else float("nan")

    # Duty factor proxy
    duty_L = float((le_s <= np.median(le_s)).mean())
    duty_R = float((re_s <= np.median(re_s)).mean())
    duty_T = float((te_s <= np.median(te_s)).mean())
    duty_B = float((be_s <= np.median(be_s)).mean())

    def si(a,b):
        return float(100.0 * abs(a-b) / ((a+b)/2.0)) if np.isfinite(a) and np.isfinite(b) and (a+b)!=0 else float("nan")

    si_lr = si(duty_L, duty_R)
    si_tb = si(duty_T, duty_B)

    # score heuristic
    gsa = np.nanmean([si_lr, si_tb])
    if not np.isfinite(gsa): score = 0.0
    elif gsa < 5:  score = 5.0
    elif gsa < 10: score = 3.5
    elif gsa < 20: score = 2.0
    else:          score = 1.0

    # speed & stride length (very rough)
    speed_px_per_frame = speed_px_accum / max(1, speed_samples)
    speed_px_per_s = speed_px_per_frame * fs
    stride_length_px = float(speed_px_per_s / max(1e-6, cadence_hz)) if np.isfinite(cadence_hz) and cadence_hz>0 else float("nan")

    # overlay & frame_jpeg
    frame_b64 = None
    overlay = []
    if sampled_frames:
        frm = sampled_frames[0]
        g = cv2.cvtColor(frm, cv2.COLOR_BGR2GRAY)
        pts = cv2.goodFeaturesToTrack(g, maxCorners=20, qualityLevel=0.01, minDistance=18)
        h,w = g.shape[:2]
        if pts is not None:
            for p in pts.reshape(-1,2):
                overlay.append({"x": float(p[0]/w), "y": float(p[1]/h), "color": "#2FB36D"})
                cv2.circle(frm, (int(p[0]), int(p[1])), 4, (50, 200, 120), -1)
        if bbox_pixels is not None:
            x,y,bw,bh = bbox_pixels
            cv2.rectangle(frm, (x,y), (x+bw, y+bh), (240, 170, 30), 2)
        frame_b64 = encode_jpeg(frm, 85)

    metrics = {
        "fps": fs,
        "cadence_hz": cadence_hz,
        "stride_time_s": stride_time,
        "duty_factor": {"left": duty_L, "right": duty_R, "top": duty_T, "bottom": duty_B},
        "symmetry_index": {"left_right": si_lr, "top_bottom": si_tb},
        "gsa": float(gsa),
        "speed_px_s": float(speed_px_per_s),
        "stride_length_px_est": float(stride_length_px),
        "score": float(score),
        "signals": {
            "left": le_s.tolist(), "right": re_s.tolist(),
            "top": te_s.tolist(), "bottom": be_s.tolist()
        }
    }
    return metrics, overlay, frame_b64

@api.post("/analyze")
async def analyze(request: Request, video: UploadFile = File(...), withers_cm: float = Form(50.0)):
    clen = request.headers.get("content-length")
    if clen and int(clen) > MAX_UPLOAD_MB * 1024 * 1024:
        return JSONResponse({"error": f"Upload too large. Limit is {MAX_UPLOAD_MB} MB."}, status_code=413)
    try:
        with NamedTemporaryFile(delete=False, suffix=Path(video.filename).suffix) as tmp:
            data = await video.read()
            tmp.write(data)
            video_path = Path(tmp.name)
        log.info(f"Received {video.filename} ({len(data)} bytes) -> {video_path}")
    except Exception as e:
        return JSONResponse({"error": f"Failed to read upload: {e}"}, status_code=400)

    try:
        metrics, overlay, frame_b64 = analyze_cv(video_path)
        rec = "Monitor at home" if metrics["score"]>2 else "Consult veterinarian for physical examination"
        payload = {
            "score": metrics["score"],
            "recommendation": rec,
            "metrics": metrics,
            "overlay_points": overlay,
            "frame_jpeg_b64": frame_b64
        }
        return JSONResponse(payload)
    except Exception as e:
        log.exception("Analysis error")
        return JSONResponse({"error": f"Analysis error: {e}"}, status_code=500)

def create_app():
    app = FastAPI(title="Hound Forward (Render v4)", version="0.2.0")
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
    app.include_router(api)
    static_dir = Path(__file__).parent / "frontend_dist"
    app.mount("/", StaticFiles(directory=str(static_dir), html=True), name="static")
    return app

app = create_app()
