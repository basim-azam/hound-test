from pathlib import Path
from typing import Dict, Any, List, Tuple
import numpy as np, cv2
from scipy.ndimage import gaussian_filter1d
def analyze_cv(video_path: Path, target_fps: float = 12.0):
    cap=cv2.VideoCapture(str(video_path)); 
    if not cap.isOpened(): raise RuntimeError("Cannot open video")
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0; step = max(1, int(round(src_fps/target_fps)))
    fgbg=cv2.createBackgroundSubtractorMOG2(history=300,varThreshold=25,detectShadows=False)
    L,R,T,B=[],[],[],[]; bbox=None; prev=None; spx=0.0; n=0; frame=None
    while True:
        ok,img=cap.read()
        if not ok: break
        if int(cap.get(cv2.CAP_PROP_POS_FRAMES))%step: continue
        h,w=img.shape[:2]; s=768.0/max(h,w); img=cv2.resize(img,(int(w*s),int(h*s))); h,w=img.shape[:2]
        g=cv2.cvtColor(img,cv2.COLOR_BGR2GRAY); m=fgbg.apply(g); m=cv2.medianBlur(m,5)
        cnts,_=cv2.findContours(m,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
        if cnts:
            x,y,bw,bh=cv2.boundingRect(max(cnts,key=cv2.contourArea))
            if bw*bh>0.02*w*h: bbox=(x,y,bw,bh)
        midx=w//2; midy=h//2; L.append(float(m[:,:midx].mean())); R.append(float(m[:,midx:].mean())); T.append(float(m[:midy,:].mean())); B.append(float(m[midy:,:].mean()))
        if prev is not None:
            flow=cv2.calcOpticalFlowFarneback(prev,g,None,0.5,3,25,3,5,1.2,0); fx=flow[...,0]
            if bbox: x,y,bw,bh=bbox; region=fx[max(0,y):min(h,y+bh),max(0,x):min(w,x+bw)]
            else: region=fx
            spx+=float(np.nanmedian(region)); n+=1
        prev=g; 
        if frame is None: frame=img.copy()
    cap.release()
    L=np.asarray(L,np.float32); R=np.asarray(R,np.float32); T=np.asarray(T,np.float32); B=np.asarray(B,np.float32)
    if len(L)<8: raise RuntimeError("Not enough frames")
    fs=target_fps; Ls=gaussian_filter1d(L,2); Rs=gaussian_filter1d(R,2); Ts=gaussian_filter1d(T,2); Bs=gaussian_filter1d(B,2)
    sig=(Ls+Rs)*0.5; freqs=np.fft.rfftfreq(len(sig),d=1.0/fs); amp=np.abs(np.fft.rfft(sig-sig.mean())); band=(freqs>=0.3)&(freqs<=3.0)
    cad=float(freqs[band][np.argmax(amp[band])]) if band.any() else float("nan"); stride=float(1.0/cad) if cad and cad>0 else float("nan")
    dutyL=float((Ls<=np.median(Ls)).mean()); dutyR=float((Rs<=np.median(Rs)).mean()); dutyT=float((Ts<=np.median(Ts)).mean()); dutyB=float((Bs<=np.median(Bs)).mean())
    si=lambda a,b: float(100.0*abs(a-b)/((a+b)/2.0)) if np.isfinite(a) and np.isfinite(b) and (a+b)!=0 else float("nan")
    si_lr=si(dutyL,dutyR); si_tb=si(dutyT,dutyB); gsa=float(np.nanmean([si_lr,si_tb]))
    score=0.0 if not np.isfinite(gsa) else (5.0 if gsa<5 else 3.5 if gsa<10 else 2.0 if gsa<20 else 1.0)
    spf=spx/max(1,n); sps=spf*fs; stride_len=float(sps/max(1e-6,cad)) if cad and cad>0 else float("nan")
    overlay=[]
    if frame is not None:
        g=cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY); pts=cv2.goodFeaturesToTrack(g,maxCorners=20,qualityLevel=0.01,minDistance=18); h,w=g.shape[:2]
        if pts is not None:
            for p in pts.reshape(-1,2): overlay.append({"x":float(p[0]/w),"y":float(p[1]/h),"color":"#2FB36D"})
        if bbox: x,y,bw,bh=bbox; cv2.rectangle(frame,(x,y),(x+bw,y+bh),(240,170,30),2)
    frame_b64=None
    if frame is not None:
        ok,buf=cv2.imencode(".jpg",frame,[int(cv2.IMWRITE_JPEG_QUALITY),85])
        if ok: import base64; frame_b64=base64.b64encode(buf.tobytes()).decode("ascii")
    metrics={"fps":fs,"cadence_hz":cad,"stride_time_s":stride,"duty_factor":{"left":dutyL,"right":dutyR,"top":dutyT,"bottom":dutyB},"symmetry_index":{"left_right":si_lr,"top_bottom":si_tb},"gsa":gsa,"speed_px_s":float(sps),"stride_length_px_est":float(stride_len)}
    return score, metrics, overlay, frame_b64
