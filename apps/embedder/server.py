"""BGE-M3 embedding sidecar — the ONE place the model lives.

Self-contained local embeddings (no per-token API cost, no third-party sees the
legal text). Used at two moments:
  * ingest time — research/legal-loader/embed_chunks.py POSTs chunk texts here to
    bake vectors into the committed db/seed/data/legal/chunks.ndjson (offline);
  * query time — the API's EmbeddingService POSTs the user's question here to get
    the query vector for pgvector search.

BGE-M3 (BAAI/bge-m3): dense 1024-dim, multilingual, 8192-token context, no word
segmentation and no query/passage instruction prefix needed (symmetric). We
normalise embeddings so cosine distance (pgvector `<=>`, vector_cosine_ops) is
the right metric.
"""
import os

from fastapi import FastAPI
from pydantic import BaseModel
from sentence_transformers import SentenceTransformer

MODEL_NAME = os.environ.get('EMBED_MODEL', 'BAAI/bge-m3')
EMBED_ID = os.environ.get('EMBED_ID', 'bge-m3@1')  # pinned into legal_document.embed_model

app = FastAPI(title='legal-embedder')
# Load at import so the container is only "healthy" once the model is ready.
model = SentenceTransformer(MODEL_NAME)
DIM = model.get_sentence_embedding_dimension()


class EmbedRequest(BaseModel):
    texts: list[str]


@app.get('/health')
def health() -> dict:
    return {'status': 'ok', 'model': MODEL_NAME, 'embed_id': EMBED_ID, 'dim': DIM}


@app.post('/embed')
def embed(req: EmbedRequest) -> dict:
    vectors = model.encode(
        req.texts,
        normalize_embeddings=True,
        batch_size=int(os.environ.get('EMBED_BATCH', '16')),
    )
    return {
        'model': MODEL_NAME,
        'embed_id': EMBED_ID,
        'dim': DIM,
        'vectors': [v.tolist() for v in vectors],
    }
