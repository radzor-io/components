import { Pinecone } from "@pinecone-database/pinecone";

export interface VectorSearchConfig {
  provider: "pinecone" | "qdrant" | "pgvector";
  apiKey?: string;
  host?: string;
  indexName: string;
  dimensions: number;
  metric?: "cosine" | "euclidean" | "dotProduct";
  topK?: number;
}

export interface SearchResult {
  id: string;
  score: number;
  metadata: Record<string, unknown>;
}

export interface IndexStats {
  totalVectors: number;
  dimensions: number;
  fullness?: number;
  indexName: string;
}

export interface VectorItem {
  id: string;
  vector: number[];
  metadata?: Record<string, unknown>;
}

export type EventMap = {
  onIndexed: { id: string; dimensions: number };
  onSearchComplete: { query: string; resultCount: number; durationMs: number };
  onError: { code: string; message: string; provider: string };
};

export type Listener<T> = (payload: T) => void;

export class VectorSearch {
  private config: Required<VectorSearchConfig>;
  private pinecone: Pinecone | null = null;
  private listeners: Map<string, Listener<unknown>[]> = new Map();

  constructor(config: VectorSearchConfig) {
    this.config = {
      provider: config.provider,
      apiKey: config.apiKey ?? "",
      host: config.host ?? "",
      indexName: config.indexName,
      dimensions: config.dimensions,
      metric: config.metric ?? "cosine",
      topK: config.topK ?? 10,
    };

    if (config.provider === "pinecone") {
      if (!config.apiKey) {
        throw new Error("apiKey is required for Pinecone provider.");
      }
      this.pinecone = new Pinecone({ apiKey: config.apiKey });
    }

    if (config.provider === "pgvector") {
      console.warn(
        "[VectorSearch] pgvector provider requires the 'pg' package and a running PostgreSQL instance with the vector extension. " +
          "Pass your PostgreSQL connection string as host. This implementation uses fetch-based pgvector REST (PostgREST) " +
          "or configure your own pg client."
      );
    }
  }

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener as Listener<unknown>);
    this.listeners.set(event, listeners);
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    const listeners = this.listeners.get(event) ?? [];
    this.listeners.set(
      event,
      listeners.filter((l) => l !== (listener as Listener<unknown>))
    );
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const listeners = this.listeners.get(event) ?? [];
    for (const listener of listeners) {
      listener(payload as unknown);
    }
  }

  // --- Qdrant helpers ---

  private qdrantUrl(path: string): string {
    return `${this.config.host}${path}`;
  }

  private async qdrantFetch(path: string, options: RequestInit = {}): Promise<unknown> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.config.apiKey) {
      headers["api-key"] = this.config.apiKey;
    }

    const response = await fetch(this.qdrantUrl(path), {
      ...options,
      headers: { ...headers, ...(options.headers as Record<string, string> ?? {}) },
    });

    const data = await response.json() as unknown;
    if (!response.ok) {
      throw new Error(`Qdrant error (${response.status}): ${JSON.stringify(data)}`);
    }
    return data;
  }

  // --- Actions ---

  async index(
    id: string,
    vector: number[],
    metadata?: Record<string, unknown>
  ): Promise<void> {
    try {
      if (this.config.provider === "pinecone") {
        const idx = this.pinecone!.index(this.config.indexName);
        await idx.upsert([{ id, values: vector, metadata: metadata ?? {} }]);
      } else if (this.config.provider === "qdrant") {
        await this.qdrantFetch(
          `/collections/${this.config.indexName}/points`,
          {
            method: "PUT",
            body: JSON.stringify({
              points: [{ id, vector, payload: metadata ?? {} }],
            }),
          }
        );
      } else {
        throw new Error(
          "pgvector: use indexBatch() with your pg client or a PostgREST endpoint."
        );
      }

      this.emit("onIndexed", { id, dimensions: vector.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "INDEX_ERROR", message, provider: this.config.provider });
      throw err;
    }
  }

  async indexBatch(items: VectorItem[]): Promise<void> {
    try {
      if (this.config.provider === "pinecone") {
        const idx = this.pinecone!.index(this.config.indexName);
        // Pinecone recommends batches of 100
        const BATCH_SIZE = 100;
        for (let i = 0; i < items.length; i += BATCH_SIZE) {
          const batch = items.slice(i, i + BATCH_SIZE);
          await idx.upsert(
            batch.map((item) => ({
              id: item.id,
              values: item.vector,
              metadata: item.metadata ?? {},
            }))
          );
        }
      } else if (this.config.provider === "qdrant") {
        await this.qdrantFetch(
          `/collections/${this.config.indexName}/points`,
          {
            method: "PUT",
            body: JSON.stringify({
              points: items.map((item) => ({
                id: item.id,
                vector: item.vector,
                payload: item.metadata ?? {},
              })),
            }),
          }
        );
      } else {
        throw new Error(
          "pgvector: implement batch insert using your pg client with unnest() or copy."
        );
      }

      for (const item of items) {
        this.emit("onIndexed", { id: item.id, dimensions: item.vector.length });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "INDEX_BATCH_ERROR", message, provider: this.config.provider });
      throw err;
    }
  }

  async search(
    vector: number[],
    topK?: number,
    filter?: Record<string, unknown>
  ): Promise<SearchResult[]> {
    const startedAt = Date.now();
    const k = topK ?? this.config.topK;

    try {
      let results: SearchResult[];

      if (this.config.provider === "pinecone") {
        const idx = this.pinecone!.index(this.config.indexName);
        const response = await idx.query({
          vector,
          topK: k,
          filter: filter as Record<string, unknown> | undefined,
          includeMetadata: true,
        });

        results = (response.matches ?? []).map((m) => ({
          id: String(m.id),
          score: m.score ?? 0,
          metadata: (m.metadata ?? {}) as Record<string, unknown>,
        }));
      } else if (this.config.provider === "qdrant") {
        const body: Record<string, unknown> = {
          vector,
          limit: k,
          with_payload: true,
        };
        if (filter) body.filter = filter;

        const data = await this.qdrantFetch(
          `/collections/${this.config.indexName}/points/search`,
          { method: "POST", body: JSON.stringify(body) }
        ) as { result?: Array<{ id: string; score: number; payload: Record<string, unknown> }> };

        results = (data.result ?? []).map((r) => ({
          id: String(r.id),
          score: r.score,
          metadata: r.payload ?? {},
        }));
      } else {
        throw new Error("pgvector: implement search using SELECT ... ORDER BY vector <=> $1 LIMIT $2");
      }

      const durationMs = Date.now() - startedAt;
      this.emit("onSearchComplete", {
        query: `vector[${vector.length}]`,
        resultCount: results.length,
        durationMs,
      });

      return results;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "SEARCH_ERROR", message, provider: this.config.provider });
      throw err;
    }
  }

  async delete(id: string): Promise<void> {
    try {
      if (this.config.provider === "pinecone") {
        const idx = this.pinecone!.index(this.config.indexName);
        await idx.deleteOne(id);
      } else if (this.config.provider === "qdrant") {
        await this.qdrantFetch(
          `/collections/${this.config.indexName}/points/delete`,
          {
            method: "POST",
            body: JSON.stringify({ points: [id] }),
          }
        );
      } else {
        throw new Error("pgvector: implement delete with DELETE FROM table WHERE id = $1");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "DELETE_ERROR", message, provider: this.config.provider });
      throw err;
    }
  }

  async getStats(): Promise<IndexStats> {
    try {
      if (this.config.provider === "pinecone") {
        const idx = this.pinecone!.index(this.config.indexName);
        const stats = await idx.describeIndexStats();
        return {
          totalVectors: stats.totalRecordCount ?? 0,
          dimensions: this.config.dimensions,
          fullness: stats.indexFullness,
          indexName: this.config.indexName,
        };
      } else if (this.config.provider === "qdrant") {
        const data = await this.qdrantFetch(
          `/collections/${this.config.indexName}`
        ) as {
          result?: {
            points_count?: number;
            config?: { params?: { vectors?: { size?: number } } };
          };
        };
        return {
          totalVectors: data.result?.points_count ?? 0,
          dimensions: data.result?.config?.params?.vectors?.size ?? this.config.dimensions,
          indexName: this.config.indexName,
        };
      } else {
        throw new Error("pgvector: implement stats with SELECT COUNT(*) FROM table");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "STATS_ERROR", message, provider: this.config.provider });
      throw err;
    }
  }
}
