# Hound Forward (Unified – one service)

This repo serves the **frontend** and **FastAPI backend** from a single container.

## Local (two terminals)

### Backend
```bash
cd backend
python -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --reload
```
Open http://127.0.0.1:8000/api/health

### Frontend
```bash
cd frontend
npm install
npm run dev
```
Open http://localhost:5173 (dev proxy sends /api → 8000).

## Single-service deploy (Render)

1. Push this repo to GitHub.
2. On Render: **New +** → **Blueprint** → select this repo (`render.yaml` present).
3. Render will build the Dockerfile:
   - Stage 1 builds Vite UI
   - Stage 2 installs Python and launches Uvicorn
4. Your site will be live at `https://<your-app>.onrender.com/` and the API at `/api/...` on the same domain.

## Single-service deploy (Cloud Run)

```bash
gcloud builds submit --tag gcr.io/PROJECT/hound-forward-unified
gcloud run deploy hound-forward-unified --image gcr.io/PROJECT/hound-forward-unified --platform managed --allow-unauthenticated --region YOUR_REGION --port 8000
```
Visit the URL Cloud Run prints; both UI and API are served there.
