// @radzor/http-client — HTTP client with retry, timeout, and event hooks

export interface HttpClientConfig {
  baseUrl?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  headers?: Record<string, string>;
}

export interface RequestOptions {
  headers?: Record<string, string>;
  params?: Record<string, string>;
  timeout?: number;
}

export interface HttpResponse<T = unknown> {
  status: number;
  headers: Record<string, string>;
  data: T;
}

export type EventMap = {
  onRequest: { method: string; url: string; attempt: number };
  onResponse: { method: string; url: string; status: number; durationMs: number };
  onRetry: { method: string; url: string; attempt: number; reason: string };
  onError: { method: string; url: string; code: string; message: string };
};

export class HttpClient {
  private config: Required<HttpClientConfig>;
  private listeners: Map<string, Function[]> = new Map();

  constructor(config: HttpClientConfig = {}) {
    this.config = {
      baseUrl: config.baseUrl ?? "",
      timeout: config.timeout ?? 30000,
      retries: config.retries ?? 3,
      retryDelay: config.retryDelay ?? 1000,
      headers: config.headers ?? {},
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

  async get<T = unknown>(path: string, options?: RequestOptions): Promise<{ status: number; data: T }> {
    const res = await this.request<T>("GET", path, options);
    return { status: res.status, data: res.data };
  }

  async post<T = unknown>(path: string, body: unknown, options?: RequestOptions): Promise<{ status: number; data: T }> {
    const res = await this.request<T>("POST", path, { ...options, body } as any);
    return { status: res.status, data: res.data };
  }

  async put<T = unknown>(path: string, body: unknown, options?: RequestOptions): Promise<{ status: number; data: T }> {
    const res = await this.request<T>("PUT", path, { ...options, body } as any);
    return { status: res.status, data: res.data };
  }

  async delete<T = unknown>(path: string, options?: RequestOptions): Promise<{ status: number; data: T }> {
    const res = await this.request<T>("DELETE", path, options);
    return { status: res.status, data: res.data };
  }

  async request<T = unknown>(
    method: string,
    path: string,
    options?: RequestOptions & { body?: unknown }
  ): Promise<HttpResponse<T>> {
    const timeoutMs = options?.timeout ?? this.config.timeout;
    const maxRetries = this.config.retries;

    let url = this.config.baseUrl + path;
    if (options?.params && Object.keys(options.params).length > 0) {
      url += "?" + new URLSearchParams(options.params).toString();
    }

    const mergedHeaders: Record<string, string> = {
      ...this.config.headers,
      ...(options?.headers ?? {}),
    };

    const hasBody = options?.body !== undefined;
    if (hasBody && !mergedHeaders["Content-Type"]) {
      mergedHeaders["Content-Type"] = "application/json";
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      this.emit("onRequest", { method, url, attempt });

      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);
      const start = Date.now();

      try {
        const res = await fetch(url, {
          method,
          headers: mergedHeaders,
          body: hasBody ? JSON.stringify(options!.body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutHandle);
        const durationMs = Date.now() - start;

        const responseHeaders: Record<string, string> = {};
        res.headers.forEach((value, key) => { responseHeaders[key] = value; });

        if (res.status >= 500 && attempt <= maxRetries) {
          const reason = `HTTP ${res.status}`;
          this.emit("onRetry", { method, url, attempt, reason });
          await this._sleep(this.config.retryDelay * Math.pow(2, attempt - 1));
          lastError = new Error(reason);
          continue;
        }

        const contentType = res.headers.get("content-type") ?? "";
        const data: T = contentType.includes("application/json")
          ? await res.json()
          : (await res.text()) as unknown as T;

        this.emit("onResponse", { method, url, status: res.status, durationMs });
        return { status: res.status, headers: responseHeaders, data };
      } catch (err: any) {
        clearTimeout(timeoutHandle);
        const isNetworkError = err.name === "AbortError" || err.name === "TypeError";

        if (isNetworkError && attempt <= maxRetries) {
          const reason = err.name === "AbortError" ? "timeout" : "network error";
          this.emit("onRetry", { method, url, attempt, reason });
          await this._sleep(this.config.retryDelay * Math.pow(2, attempt - 1));
          lastError = err;
          continue;
        }

        this.emit("onError", { method, url, code: err.name ?? "FETCH_ERROR", message: err.message });
        throw err;
      }
    }

    this.emit("onError", { method, url, code: "MAX_RETRIES", message: lastError?.message ?? "Max retries exceeded" });
    throw lastError ?? new Error("Max retries exceeded");
  }

  private _sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
