import os, traceback
from pathlib import Path
from rq import Queue, Connection, Worker, get_current_job
import redis
from cv_pipeline import analyze_cv
from dlc_pipeline import analyze_dlc
from shared.schema import result_payload
REDIS_URL=os.getenv("REDIS_URL","redis://localhost:6379/0")
USE_DLC=os.getenv("USE_DLC","False").lower() in ("1","true","yes")
def run_analysis(video_path_str: str, withers_cm: float = 50.0, meta: dict = None):
    try:
        video_path=Path(video_path_str)
        if USE_DLC:
            try: score,metrics,overlay,frame_b64=analyze_dlc(video_path)
            except Exception: score,metrics,overlay,frame_b64=analyze_cv(video_path)
        else: score,metrics,overlay,frame_b64=analyze_cv(video_path)
        rec="Monitor at home" if score>2 else "Consult veterinarian for physical examination"
        return result_payload(score, rec, metrics, overlay, frame_b64)
    except Exception as e:
        return {"error": str(e), "trace": traceback.format_exc()}
if __name__=="__main__":
    r=redis.from_url(REDIS_URL)
    with Connection(r):
        Worker(["houndq"]).work(with_scheduler=True)
