// @radzor/graphql-client — Execute GraphQL queries and mutations with caching and batching

export interface GraphQLClientConfig {
  endpoint: string;
  headers?: Record<string, string>;
  cacheEnabled?: boolean;
  cacheTtlMs?: number;
  batchEnabled?: boolean;
  batchIntervalMs?: number;
  wsEndpoint?: string;
}

export interface GraphQLError {
  message: string;
  path?: string[];
  extensions?: Record<string, unknown>;
}

export interface GraphQLResult<T = unknown> {
  data: T | null;
  errors?: GraphQLError[];
  cached: boolean;
}

interface CacheEntry {
  result: GraphQLResult;
  expiresAt: number;
}

interface BatchedRequest {
  query: string;
  variables?: Record<string, unknown>;
  resolve: (result: GraphQLResult) => void;
  reject: (error: Error) => void;
}

export type EventMap = {
  onError: { operation: string; message: string; status: number };
};

export type Listener<T> = (event: T) => void;

export class GraphQLClient {
  private config: {
    endpoint: string;
    headers: Record<string, string>;
    cacheEnabled: boolean;
    cacheTtlMs: number;
    batchEnabled: boolean;
    batchIntervalMs: number;
    wsEndpoint: string;
  };
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};
  private cache: Map<string, CacheEntry> = new Map();
  private batchQueue: BatchedRequest[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private subscriptionIdCounter = 0;

  constructor(config: GraphQLClientConfig) {
    const wsDefault = config.endpoint
      .replace(/^http:/, "ws:")
      .replace(/^https:/, "wss:");

    this.config = {
      endpoint: config.endpoint,
      headers: config.headers ?? {},
      cacheEnabled: config.cacheEnabled ?? false,
      cacheTtlMs: config.cacheTtlMs ?? 60000,
      batchEnabled: config.batchEnabled ?? false,
      batchIntervalMs: config.batchIntervalMs ?? 50,
      wsEndpoint: config.wsEndpoint ?? wsDefault,
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

  /** Execute a GraphQL query. Returns cached result if available. */
  async query<T = unknown>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<GraphQLResult<T>> {
    // Check cache
    if (this.config.cacheEnabled) {
      const cacheKey = this.buildCacheKey(query, variables);
      const cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return { ...cached.result, cached: true } as GraphQLResult<T>;
      }
    }

    // Batching
    if (this.config.batchEnabled) {
      return this.addToBatch<T>(query, variables);
    }

    const result = await this.executeRequest<T>(query, variables);

    // Store in cache
    if (this.config.cacheEnabled && !result.errors?.length) {
      const cacheKey = this.buildCacheKey(query, variables);
      this.cache.set(cacheKey, {
        result,
        expiresAt: Date.now() + this.config.cacheTtlMs,
      });
    }

    return result;
  }

  /** Execute a GraphQL mutation. Never cached. */
  async mutate<T = unknown>(
    mutation: string,
    variables?: Record<string, unknown>
  ): Promise<GraphQLResult<T>> {
    // Mutations invalidate cache
    if (this.config.cacheEnabled) {
      this.cache.clear();
    }

    return this.executeRequest<T>(mutation, variables);
  }

  /** Start a GraphQL subscription over WebSocket. */
  subscribe<T = unknown>(
    subscription: string,
    variables: Record<string, unknown> | undefined,
    onData: (data: T) => void
  ): { unsubscribe: () => void } {
    const id = String(++this.subscriptionIdCounter);
    let ws: WebSocket | null = null;
    let closed = false;

    const connect = () => {
      ws = new WebSocket(this.config.wsEndpoint, "graphql-transport-ws");

      ws.onopen = () => {
        ws!.send(JSON.stringify({ type: "connection_init", payload: this.config.headers }));
      };

      ws.onmessage = (event: MessageEvent) => {
        const msg = JSON.parse(String(event.data));

        switch (msg.type) {
          case "connection_ack":
            ws!.send(
              JSON.stringify({
                id,
                type: "subscribe",
                payload: { query: subscription, variables },
              })
            );
            break;

          case "next":
            if (msg.id === id && msg.payload?.data) {
              onData(msg.payload.data as T);
            }
            break;

          case "error":
            if (msg.id === id) {
              this.emit("onError", {
                operation: "subscription",
                message: JSON.stringify(msg.payload),
                status: 0,
              });
            }
            break;

          case "complete":
            if (msg.id === id) {
              ws?.close();
            }
            break;
        }
      };

      ws.onerror = () => {
        this.emit("onError", {
          operation: "subscription",
          message: "WebSocket connection error",
          status: 0,
        });
      };

      ws.onclose = () => {
        if (!closed) {
          // Reconnect after delay
          setTimeout(() => {
            if (!closed) connect();
          }, 3000);
        }
      };
    };

    connect();

    return {
      unsubscribe: () => {
        closed = true;
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ id, type: "complete" }));
          ws.close();
        }
      },
    };
  }

  /** Update the batching window. */
  setBatchInterval(ms: number): void {
    this.config.batchIntervalMs = ms;
  }

  /** Clear the response cache. */
  clearCache(): void {
    this.cache.clear();
  }

  // ─── HTTP execution ────────────────────────────────────

  private async executeRequest<T>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<GraphQLResult<T>> {
    const res = await fetch(this.config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.config.headers,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      const body = await res.text();
      this.emit("onError", {
        operation: query.trim().split(/[(\s{]/)[0],
        message: `HTTP ${res.status}: ${body}`,
        status: res.status,
      });
      throw new Error(`GraphQL HTTP error ${res.status}: ${body}`);
    }

    const json = await res.json();
    return {
      data: json.data ?? null,
      errors: json.errors,
      cached: false,
    };
  }

  // ─── Batching ──────────────────────────────────────────

  private addToBatch<T>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<GraphQLResult<T>> {
    return new Promise<GraphQLResult<T>>((resolve, reject) => {
      this.batchQueue.push({
        query,
        variables,
        resolve: resolve as (result: GraphQLResult) => void,
        reject,
      });

      if (!this.batchTimer) {
        this.batchTimer = setTimeout(() => this.flushBatch(), this.config.batchIntervalMs);
      }
    });
  }

  private async flushBatch(): Promise<void> {
    this.batchTimer = null;
    const queue = [...this.batchQueue];
    this.batchQueue = [];

    if (queue.length === 0) return;

    if (queue.length === 1) {
      // Single request, no need to batch
      try {
        const result = await this.executeRequest(queue[0].query, queue[0].variables);
        queue[0].resolve(result);
      } catch (err) {
        queue[0].reject(err as Error);
      }
      return;
    }

    // Send as array of operations
    const operations = queue.map((req) => ({
      query: req.query,
      variables: req.variables,
    }));

    try {
      const res = await fetch(this.config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...this.config.headers,
        },
        body: JSON.stringify(operations),
      });

      if (!res.ok) {
        const body = await res.text();
        const error = new Error(`GraphQL batch HTTP error ${res.status}: ${body}`);
        queue.forEach((req) => req.reject(error));
        return;
      }

      const results = await res.json();

      if (Array.isArray(results)) {
        for (let i = 0; i < queue.length; i++) {
          const result: GraphQLResult = {
            data: results[i]?.data ?? null,
            errors: results[i]?.errors,
            cached: false,
          };
          queue[i].resolve(result);
        }
      } else {
        // Server doesn't support batching — fall back
        const result: GraphQLResult = {
          data: results.data ?? null,
          errors: results.errors,
          cached: false,
        };
        queue[0].resolve(result);
        for (let i = 1; i < queue.length; i++) {
          try {
            const r = await this.executeRequest(queue[i].query, queue[i].variables);
            queue[i].resolve(r);
          } catch (err) {
            queue[i].reject(err as Error);
          }
        }
      }
    } catch (err) {
      queue.forEach((req) => req.reject(err as Error));
    }
  }

  // ─── Cache helpers ─────────────────────────────────────

  private buildCacheKey(query: string, variables?: Record<string, unknown>): string {
    const normalized = query.replace(/\s+/g, " ").trim();
    const varsKey = variables ? JSON.stringify(variables, Object.keys(variables).sort()) : "";
    return `${normalized}::${varsKey}`;
  }
}

export default GraphQLClient;
