from pathlib import Path
from typing import Dict, Any, List, Tuple, Optional
import os, json, cv2, base64, numpy as np
def try_import_dlc():
    try:
        import deeplabcut
        return deeplabcut
    except Exception:
        return None
def find_output_json(video_path: Path) -> Optional[Path]:
    base=video_path.stem; parent=video_path.parent
    c=[p for p in parent.glob(f"{base}*/*.json")]+[p for p in parent.glob(f"{base}*.json")]
    return sorted(c, key=lambda p:(p.stat().st_mtime,len(str(p))))[-1] if c else None
def analyze_dlc(video_path: Path):
    dlc=try_import_dlc()
    if dlc is None: raise RuntimeError("DeepLabCut not installed")
    dlc.video_inference_superanimal([str(video_path)], superanimal_name="superanimal_quadruped", model_name="hrnet_w32", detector_name="fasterrcnn_resnet50_fpn_v2", video_adapt=False)
    out_json=find_output_json(video_path)
    if out_json is None: raise RuntimeError("DLC produced no JSON")
    preds=json.load(open(out_json,"r"))
    if not isinstance(preds,list) or not preds: raise RuntimeError("Empty DLC predictions")
    idx=len(preds)//2; frame=preds[idx]
    overlay=[]
    if "coordinates" in frame:
        coords=frame["coordinates"][0]; confs=frame.get("confidence",[[1.0]*len(coords)])[0]
        for i,(x,y) in enumerate(coords):
            overlay.append({"x":float(x),"y":float(y),"color":"#2FB36D","conf":float(confs[i]) if i<len(confs) else 1.0,"label":f"kp_{i}"})
    cap=cv2.VideoCapture(str(video_path)); cap.set(cv2.CAP_PROP_POS_FRAMES, idx); ok, img=cap.read(); cap.release()
    if not ok: img=np.full((720,1280,3),255,np.uint8)
    h,w=img.shape[:2]
    for pt in overlay:
        X=int(np.clip(pt["x"],0,w-1)); Y=int(np.clip(pt["y"],0,h-1))
        cv2.circle(img,(X,Y),4,(40,210,120),-1)
    ok,buf=cv2.imencode(".jpg",img,[int(cv2.IMWRITE_JPEG_QUALITY),85]); b64=base64.b64encode(buf.tobytes()).decode("ascii") if ok else None
    xs=[pt["x"] for pt in overlay]
    if len(xs)>=2:
        mid=np.median(xs); L=[pt for pt in overlay if pt["x"]<=mid]; R=[pt for pt in overlay if pt["x"]>mid]
        my=lambda pts: float(np.mean([p["y"] for p in pts])) if pts else float("nan")
        yl,yr=my(L),my(R); si_lr=float(100.0*abs(yl-yr)/max(1.0,(abs(yl)+abs(yr))/2.0)) if np.isfinite(yl) and np.isfinite(yr) else float("nan")
    else: si_lr=float("nan")
    gsa=si_lr; score=0.0 if not np.isfinite(gsa) else (5.0 if gsa<5 else 3.5 if gsa<10 else 2.0 if gsa<20 else 1.0)
    for pt in overlay: pt["x"]=float(pt["x"]/w); pt["y"]=float(pt["y"]/h)
    metrics={"symmetry_index":{"left_right":si_lr},"gsa":gsa}
    return score, metrics, overlay, b64
