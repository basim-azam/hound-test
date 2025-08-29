FROM nvidia/cuda:12.1.1-cudnn8-runtime-ubuntu22.04
ENV DEBIAN_FRONTEND=noninteractive PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-pip ffmpeg libsm6 libxext6 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt ./
RUN python3 -m pip install --upgrade pip && pip install --no-cache-dir -r requirements.txt
COPY . /app
ENV REDIS_URL=redis://redis:6379/0 USE_DLC=True
CMD ["python3","run_worker.py"]
