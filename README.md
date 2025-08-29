# Hound Forward – Render v4 (Unified)

- **Real CPU Computer Vision** (OpenCV) producing cadence, duty factors, symmetry indices, speed and a rough stride length estimate.
- Returns an **annotated frame** (base64 JPEG) and **overlay points** to draw in the UI.
- **Full-width meter** with clamped pointer so it never overshoots the bar.
- Single Docker service (serves UI + API). `render.yaml` included.

## Deploy on Render
1. Push this folder to GitHub.
2. Render → **New** → **Blueprint** → pick the repo (uses `render.yaml`).
3. Open the URL; the UI and API share the same domain, API is under `/api`.

## Local (two terminals)
```bash
# Backend dev (optional)
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload
```
```bash
# Frontend dev
cd frontend
npm install
npm run dev
```
For production Docker build, use the provided `Dockerfile` (multi-stage).

## Notes
- This is a **fast proxy** for gait metrics; DLC SuperAnimal can be plugged in later for keypoint-level analysis.
- Keep uploads short (10–15 s, 720p). Increase `MAX_UPLOAD_MB` if your host allows larger bodies.
