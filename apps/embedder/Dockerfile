# BGE-M3 embedding sidecar. CPU-only torch keeps the image ~2GB smaller than the
# default CUDA wheel; the model is baked in at build time so the container needs no
# network at runtime and is fully self-contained (matches the "easy to move
# servers" goal — no first-run download).
FROM python:3.11-slim

ENV HF_HOME=/models \
    HF_HUB_OFFLINE=0 \
    TRANSFORMERS_NO_ADVISORY_WARNINGS=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# CPU-only torch from the PyTorch CPU index (avoids ~2GB of CUDA libraries).
RUN pip install --no-cache-dir torch==2.6.0 --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Bake the model into the image layer (downloads once at build).
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-m3')"

COPY server.py .

EXPOSE 8000
# 1 worker: the model is large and stateless per request; scale by replicas, not workers.
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
