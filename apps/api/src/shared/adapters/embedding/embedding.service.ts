import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Client for the BGE-M3 embedding sidecar (apps/embedder). The model lives in
 * exactly one place — this only turns a query string into the 1024-dim vector the
 * legal RAG retrieval feeds to pgvector. Self-contained and cost-free (no per-token
 * API): the sidecar is reached on the compose network at http://embedder:8000.
 *
 * pgvector is only ever used on legal prose (legal_chunk). This service must never
 * be wired into the tariff path — see the no-LLM-on-tariff-numbers ADR.
 */
@Injectable()
export class EmbeddingService {
  private readonly url: string;

  constructor(config: ConfigService) {
    this.url = (config.get<string>('EMBEDDER_URL') ?? 'http://localhost:8000').replace(/\/$/, '');
  }

  /** Embed a single text, returning the dense vector. Throws if the sidecar is down. */
  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${this.url}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ texts: [text] }),
    });
    if (!res.ok) {
      throw new Error(`embedder returned ${res.status}`);
    }
    const data = (await res.json()) as { vectors: number[][] };
    const vec = data.vectors?.[0];
    if (!Array.isArray(vec) || vec.length === 0) {
      throw new Error('embedder returned no vector');
    }
    return vec;
  }
}
