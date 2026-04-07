// @radzor/embeddings-store — In-memory vector store with similarity search

export type Provider = "openai" | "ollama";

export interface EmbeddingsStoreConfig {
  provider: Provider;
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface SearchResult {
  id: string;
  text: string;
  score: number;
  metadata: Record<string, any>;
}

export interface StoredDocument {
  id: string;
  text: string;
  embedding: number[];
  metadata: Record<string, any>;
}

export type EventMap = {
  onStored: { id: string; dimensions: number };
  onSearchComplete: { query: string; resultCount: number };
  onError: { code: string; message: string };
};

const DEFAULTS: Record<Provider, { url: string; model: string }> = {
  openai: { url: "https://api.openai.com/v1", model: "text-embedding-3-small" },
  ollama: { url: "http://localhost:11434", model: "nomic-embed-text" },
};

export class EmbeddingsStore {
  private config: { provider: Provider; apiKey: string; model: string; baseUrl: string };
  private documents: Map<string, StoredDocument> = new Map();
  private listeners: Map<string, Function[]> = new Map();

  constructor(config: EmbeddingsStoreConfig) {
    const defaults = DEFAULTS[config.provider];
    this.config = {
      provider: config.provider,
      apiKey: config.apiKey ?? "",
      model: config.model ?? defaults.model,
      baseUrl: config.baseUrl ?? defaults.url,
    };
  }

  on<K extends keyof EventMap>(event: K, handler: (payload: EventMap[K]) => void): void {
    const handlers = this.listeners.get(event) ?? [];
    handlers.push(handler as Function);
    this.listeners.set(event, handlers);
  }

  off<K extends keyof EventMap>(event: K, handler: (payload: EventMap[K]) => void): void {
    const handlers = this.listeners.get(event) ?? [];
    this.listeners.set(event, handlers.filter((h) => h !== handler));
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    for (const handler of this.listeners.get(event) ?? []) handler(payload);
  }

  async add(id: string, text: string, metadata: Record<string, any> = {}): Promise<void> {
    try {
      const embedding = await this.embed(text);
      this.documents.set(id, { id, text, embedding, metadata });
      this.emit("onStored", { id, dimensions: embedding.length });
    } catch (err: any) {
      this.emit("onError", { code: "EMBED_FAILED", message: err.message });
      throw err;
    }
  }

  async search(query: string, topK: number = 5): Promise<SearchResult[]> {
    try {
      const queryEmbedding = await this.embed(query);
      const results: SearchResult[] = [];

      for (const doc of this.documents.values()) {
        const score = this.cosineSimilarity(queryEmbedding, doc.embedding);
        results.push({ id: doc.id, text: doc.text, score, metadata: doc.metadata });
      }

      results.sort((a, b) => b.score - a.score);
      const topResults = results.slice(0, topK);
      this.emit("onSearchComplete", { query, resultCount: topResults.length });
      return topResults;
    } catch (err: any) {
      this.emit("onError", { code: "SEARCH_FAILED", message: err.message });
      throw err;
    }
  }

  remove(id: string): void {
    this.documents.delete(id);
  }

  size(): number {
    return this.documents.size;
  }

  // ─── Embedding Providers ─────────────────────────────────

  private async embed(text: string): Promise<number[]> {
    switch (this.config.provider) {
      case "openai":
        return this.embedOpenAI(text);
      case "ollama":
        return this.embedOllama(text);
      default:
        throw new Error(`Unknown provider: ${this.config.provider}`);
    }
  }

  private async embedOpenAI(text: string): Promise<number[]> {
    const res = await fetch(`${this.config.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: this.config.model, input: text }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message ?? `OpenAI API error: ${res.status}`);
    }

    const data = await res.json();
    return data.data[0].embedding;
  }

  private async embedOllama(text: string): Promise<number[]> {
    const res = await fetch(`${this.config.baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.config.model, prompt: text }),
    });

    if (!res.ok) throw new Error(`Ollama API error: ${res.status}`);
    const data = await res.json();
    return data.embedding;
  }

  // ─── Cosine Similarity ──────────────────────────────────

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0, magA = 0, magB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
  }
}
