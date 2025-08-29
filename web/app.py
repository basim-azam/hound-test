import os, uuid
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from rq import Queue
import redis
STATIC_DIR = Path(__file__).parent / "frontend_dist"
UPLOAD_DIR = Path("/tmp/uploads"); UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
REDIS_URL=os.getenv("REDIS_URL","redis://localhost:6379/0")
r=redis.from_url(REDIS_URL); q=Queue("houndq", connection=r)
app=FastAPI(title="Hound Forward Pro", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
@app.get("/api/health")
def health():
    try: r.ping(); return {"status":"ok"}
    except Exception as e: return JSONResponse({"status":"bad","error":str(e)}, status_code=500)
@app.post("/api/analyze")
async def analyze(video: UploadFile = File(...), withers_cm: float = Form(50.0)):
    job_id=str(uuid.uuid4()); suffix=Path(video.filename).suffix or ".mp4"; save_path=UPLOAD_DIR / f"{job_id}{suffix}"; save_path.write_bytes(await video.read())
    job=q.enqueue("run_worker.run_analysis", str(save_path), withers_cm, {}, job_timeout=900)
    return {"job_id": job.id}
@app.get("/api/result/{job_id}")
def result(job_id: str):
    from rq.job import Job
    try: job=Job.fetch(job_id, connection=r)
    except Exception: return JSONResponse({"error":"Unknown job id"}, status_code=404)
    st=job.get_status()
    if st=="finished": return {"status":"done","result": job.result}
    elif st=="failed": return JSONResponse({"status":"error","error": str(job.exc_info)}, status_code=500)
    else: return {"status": st}
app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
