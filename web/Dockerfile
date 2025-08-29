FROM node:18-alpine AS ui
WORKDIR /ui
COPY ../ui/package.json ../ui/package-lock.json* ./
RUN npm ci || npm install
COPY ../ui/ ./
RUN npm run build
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY app.py /app/app.py
COPY --from=ui /ui/dist /app/frontend_dist
ENV REDIS_URL=redis://redis:6379/0
EXPOSE 8000
CMD ["uvicorn","app:app","--host","0.0.0.0","--port","8000"]
