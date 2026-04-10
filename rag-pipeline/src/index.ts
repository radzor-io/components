// @radzor/rag-pipeline — End-to-end Retrieval-Augmented Generation pipeline with in-memory vector index

export interface RagPipelineConfig {
  embeddingApiKey: string;
  completionApiKey?: string;
  chunkSize?: number;
  overlapSize?: number;
  embeddingModel?: string;
  completionModel?: string;
  topK?: number;
  embeddingBaseUrl?: string;
  completionBaseUrl?: string;
}

export interface RagResult {
  answer: string;
  sources: Array<{ text: string; score: number; metadata?: Record<string, string> }>;
  confidence: number;
}

export interface IngestResult {
  documentId: string;
  chunkCount: number;
}

interface IndexEntry {
  text: string;
  embedding: number[];
  documentId: string;
  metadata?: Record<string, string>;
}

export type EventMap = {
  onQueryComplete: { query: string; answer: string; sourceCount: number; confidence: number };
  onIngestComplete: { documentId: string; chunkCount: number };
};

export type Listener<T> = (event: T) => void;

export class RagPipeline {
  private config: {
    embeddingApiKey: string;
    completionApiKey: string;
    chunkSize: number;
    overlapSize: number;
    embeddingModel: string;
    completionModel: string;
    topK: number;
    embeddingBaseUrl: string;
    completionBaseUrl: string;
  };
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};
  private index: IndexEntry[] = [];
  private docCounter = 0;

  constructor(config: RagPipelineConfig) {
    this.config = {
      embeddingApiKey: config.embeddingApiKey,
      completionApiKey: config.completionApiKey ?? config.embeddingApiKey,
      chunkSize: config.chunkSize ?? 512,
      overlapSize: config.overlapSize ?? 64,
      embeddingModel: config.embeddingModel ?? "text-embedding-3-small",
      completionModel: config.completionModel ?? "gpt-4o-mini",
      topK: config.topK ?? 5,
      embeddingBaseUrl: config.embeddingBaseUrl ?? "https://api.openai.com/v1",
      completionBaseUrl: config.completionBaseUrl ?? "https://api.openai.com/v1",
    };
  }

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event]!.push(listener);
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    const list = this.listeners[event];
    if (list) this.listeners[event] = list.filter((l) => l !== listener) as typeof list;
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const list = this.listeners[event];
    if (list) list.forEach((l) => l(payload));
  }

  /** Ingest a text document: chunk, embed, and store in the vector index. */
  async ingest(text: string, metadata?: Record<string, string>): Promise<IngestResult> {
    const documentId = `doc_${++this.docCounter}`;
    const chunks = this.chunkText(text);
    const embeddings = await this.embedBatch(chunks);

    for (let i = 0; i < chunks.length; i++) {
      this.index.push({
        text: chunks[i],
        embedding: embeddings[i],
        documentId,
        metadata,
      });
    }

    const result: IngestResult = { documentId, chunkCount: chunks.length };
    this.emit("onIngestComplete", result);
    return result;
  }

  /** Query the pipeline: embed the question, retrieve top-K, call LLM with context. */
  async query(question: string, systemPrompt?: string): Promise<RagResult> {
    const questionEmbedding = (await this.embedBatch([question]))[0];
    const scored = this.index
      .map((entry) => ({
        text: entry.text,
        score: this.cosineSimilarity(questionEmbedding, entry.embedding),
        metadata: entry.metadata,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, this.config.topK);

    const confidence = scored.length > 0
      ? scored.reduce((sum, s) => sum + s.score, 0) / scored.length
      : 0;

    const contextBlock = scored
      .map((s, i) => `[Source ${i + 1} (score: ${s.score.toFixed(3)})]\n${s.text}`)
      .join("\n\n");

    const defaultSystem =
      "You are a helpful assistant. Answer the user's question using ONLY the provided context. " +
      "If the context does not contain enough information, say so. Cite source numbers when possible.";

    const answer = await this.callCompletion(
      systemPrompt ?? defaultSystem,
      `Context:\n${contextBlock}\n\nQuestion: ${question}`
    );

    const ragResult: RagResult = { answer, sources: scored, confidence };
    this.emit("onQueryComplete", {
      query: question,
      answer,
      sourceCount: scored.length,
      confidence,
    });
    return ragResult;
  }

  /** Remove all documents and embeddings from the index. */
  clearIndex(): void {
    this.index = [];
    this.docCounter = 0;
  }

  /** Get current index size. */
  getIndexSize(): number {
    return this.index.length;
  }

  // ─── Chunking ───────────────────────────────────────────

  private chunkText(text: string): string[] {
    const { chunkSize, overlapSize } = this.config;
    const chunks: string[] = [];
    let start = 0;

    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length);
      let chunk = text.slice(start, end);

      // Try to break at sentence boundary within the last 20% of the chunk
      if (end < text.length) {
        const cutoff = Math.floor(chunk.length * 0.8);
        const sentenceEnd = chunk.lastIndexOf(". ", chunk.length);
        if (sentenceEnd > cutoff) {
          chunk = chunk.slice(0, sentenceEnd + 1);
        }
      }

      chunks.push(chunk.trim());
      start += chunk.length - overlapSize;
      if (start <= 0 && chunks.length > 0) start = chunkSize; // safety
    }

    return chunks.filter((c) => c.length > 0);
  }

  // ─── Embeddings ─────────────────────────────────────────

  private async embedBatch(texts: string[]): Promise<number[][]> {
    const batchSize = 100;
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      const res = await fetch(`${this.config.embeddingBaseUrl}/embeddings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.config.embeddingApiKey}`,
        },
        body: JSON.stringify({
          model: this.config.embeddingModel,
          input: batch,
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Embedding API error ${res.status}: ${body}`);
      }

      const data = await res.json();
      const sorted = data.data.sort(
        (a: { index: number }, b: { index: number }) => a.index - b.index
      );
      for (const item of sorted) {
        allEmbeddings.push(item.embedding);
      }
    }

    return allEmbeddings;
  }

  // ─── Completion ─────────────────────────────────────────

  private async callCompletion(systemPrompt: string, userMessage: string): Promise<string> {
    const res = await fetch(`${this.config.completionBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.completionApiKey}`,
      },
      body: JSON.stringify({
        model: this.config.completionModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        temperature: 0.2,
        max_tokens: 2048,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Completion API error ${res.status}: ${body}`);
    }

    const data = await res.json();
    return data.choices[0].message.content ?? "";
  }

  // ─── Vector math ────────────────────────────────────────

  private cosineSimilarity(a: number[], b: number[]): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
  }
}

export default RagPipeline;
