import { MeiliSearch } from "meilisearch";

export interface SearchIndexConfig {
  provider: "meilisearch" | "typesense";
  host: string;
  apiKey: string;
  indexName: string;
  searchableFields?: string[];
  filterableFields?: string[];
  primaryKey?: string;
}

export interface SearchOptions {
  filter?: string;
  facets?: string[];
  limit?: number;
  offset?: number;
  sort?: string[];
}

export interface SearchResults {
  hits: unknown[];
  total: number;
  processingTimeMs: number;
  facets?: Record<string, unknown>;
}

export interface IndexSettings {
  searchableAttributes?: string[];
  filterableAttributes?: string[];
  sortableAttributes?: string[];
  rankingRules?: string[];
  [key: string]: unknown;
}

export type EventMap = {
  onIndexed: { documentCount: number; indexName: string; durationMs: number };
  onSearchComplete: { query: string; hits: number; processingMs: number };
  onError: { code: string; message: string; operation: string };
};

export type Listener<T> = (payload: T) => void;

export class SearchIndex {
  private config: Required<SearchIndexConfig>;
  private meili: MeiliSearch | null = null;
  private listeners: Map<string, Listener<unknown>[]> = new Map();

  constructor(config: SearchIndexConfig) {
    if (!config.apiKey) {
      throw new Error(`API key required for provider "${config.provider}"`);
    }
    this.config = {
      provider: config.provider,
      host: config.host,
      apiKey: config.apiKey,
      indexName: config.indexName,
      searchableFields: config.searchableFields ?? [],
      filterableFields: config.filterableFields ?? [],
      primaryKey: config.primaryKey ?? "id",
    };

    if (config.provider === "meilisearch") {
      this.meili = new MeiliSearch({
        host: config.host,
        apiKey: config.apiKey,
      });
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

  private typesenseUrl(path: string): string {
    return `${this.config.host}${path}`;
  }

  private typesenseFetch(
    path: string,
    options: RequestInit = {}
  ): Promise<Response> {
    return fetch(this.typesenseUrl(path), {
      ...options,
      headers: {
        "X-TYPESENSE-API-KEY": this.config.apiKey,
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });
  }

  async index(documents: Record<string, unknown>[]): Promise<void> {
    const startedAt = Date.now();

    try {
      if (this.config.provider === "meilisearch") {
        const idx = this.meili!.index(this.config.indexName);
        await idx.addDocuments(documents, { primaryKey: this.config.primaryKey });
      } else {
        // Typesense: POST /collections/{name}/documents/import
        const ndjson = documents.map((d) => JSON.stringify(d)).join("\n");
        const response = await this.typesenseFetch(
          `/collections/${this.config.indexName}/documents/import?action=upsert`,
          {
            method: "POST",
            headers: { "Content-Type": "text/plain" },
            body: ndjson,
          }
        );
        if (!response.ok) {
          throw new Error(`Typesense index error: ${await response.text()}`);
        }
      }

      const durationMs = Date.now() - startedAt;
      this.emit("onIndexed", {
        documentCount: documents.length,
        indexName: this.config.indexName,
        durationMs,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "INDEX_ERROR", message, operation: "index" });
      throw err;
    }
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResults> {
    try {
      if (this.config.provider === "meilisearch") {
        const idx = this.meili!.index(this.config.indexName);
        const result = await idx.search(query, {
          filter: options.filter,
          facets: options.facets,
          limit: options.limit ?? 20,
          offset: options.offset ?? 0,
          sort: options.sort,
        });

        this.emit("onSearchComplete", {
          query,
          hits: result.hits.length,
          processingMs: result.processingTimeMs,
        });

        return {
          hits: result.hits,
          total: result.estimatedTotalHits ?? result.hits.length,
          processingTimeMs: result.processingTimeMs,
          facets: result.facetDistribution as Record<string, unknown> | undefined,
        };
      } else {
        // Typesense: GET /collections/{name}/documents/search
        const params = new URLSearchParams({
          q: query,
          query_by: this.config.searchableFields.join(",") || "*",
          per_page: String(options.limit ?? 20),
          page: String(Math.floor((options.offset ?? 0) / (options.limit ?? 20)) + 1),
        });

        if (options.filter) params.set("filter_by", options.filter);
        if (options.facets?.length) params.set("facet_by", options.facets.join(","));
        if (options.sort?.length) params.set("sort_by", options.sort.join(","));

        const response = await this.typesenseFetch(
          `/collections/${this.config.indexName}/documents/search?${params}`
        );

        if (!response.ok) {
          throw new Error(`Typesense search error: ${await response.text()}`);
        }

        const data = await response.json() as {
          hits: Array<{ document: unknown }>;
          found: number;
          search_time_ms: number;
          facet_counts?: unknown;
        };

        const processingTimeMs = data.search_time_ms ?? 0;
        const hits = data.hits?.map((h) => h.document) ?? [];

        this.emit("onSearchComplete", { query, hits: hits.length, processingMs: processingTimeMs });

        return {
          hits,
          total: data.found ?? hits.length,
          processingTimeMs,
          facets: data.facet_counts as Record<string, unknown> | undefined,
        };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "SEARCH_ERROR", message, operation: "search" });
      throw err;
    }
  }

  async update(documents: Record<string, unknown>[]): Promise<void> {
    try {
      if (this.config.provider === "meilisearch") {
        const idx = this.meili!.index(this.config.indexName);
        await idx.updateDocuments(documents, { primaryKey: this.config.primaryKey });
      } else {
        // Typesense: same as index with action=upsert
        await this.index(documents);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "UPDATE_ERROR", message, operation: "update" });
      throw err;
    }
  }

  async delete(ids: string[]): Promise<void> {
    try {
      if (this.config.provider === "meilisearch") {
        const idx = this.meili!.index(this.config.indexName);
        await idx.deleteDocuments(ids);
      } else {
        for (const id of ids) {
          await this.typesenseFetch(
            `/collections/${this.config.indexName}/documents/${id}`,
            { method: "DELETE" }
          );
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "DELETE_ERROR", message, operation: "delete" });
      throw err;
    }
  }

  async clearIndex(): Promise<void> {
    try {
      if (this.config.provider === "meilisearch") {
        const idx = this.meili!.index(this.config.indexName);
        await idx.deleteAllDocuments();
      } else {
        await this.typesenseFetch(
          `/collections/${this.config.indexName}/documents`,
          {
            method: "DELETE",
            body: JSON.stringify({ filter_by: "" }),
          }
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "CLEAR_ERROR", message, operation: "clearIndex" });
      throw err;
    }
  }

  async configure(settings: IndexSettings): Promise<void> {
    try {
      if (this.config.provider === "meilisearch") {
        const idx = this.meili!.index(this.config.indexName);
        await idx.updateSettings({
          searchableAttributes: settings.searchableAttributes,
          filterableAttributes: settings.filterableAttributes,
          sortableAttributes: settings.sortableAttributes,
          rankingRules: settings.rankingRules as string[],
        });
      } else {
        // Typesense: PATCH /collections/{name}
        const response = await this.typesenseFetch(
          `/collections/${this.config.indexName}`,
          { method: "PATCH", body: JSON.stringify(settings) }
        );
        if (!response.ok) {
          throw new Error(`Typesense configure error: ${await response.text()}`);
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "CONFIGURE_ERROR", message, operation: "configure" });
      throw err;
    }
  }
}
