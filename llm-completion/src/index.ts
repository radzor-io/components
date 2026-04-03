// @radzor/llm-completion — Universal LLM completion client for OpenAI, Anthropic, and Ollama

export type LLMProvider = "openai" | "anthropic" | "ollama";

export interface LLMCompletionConfig {
  provider: LLMProvider;
  apiKey?: string;
  model: string;
  baseUrl?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CompletionResult {
  content: string;
  model: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  finishReason: string;
}

export interface StreamChunk {
  content: string;
  done: boolean;
}

export interface LLMError {
  code: string;
  message: string;
  provider: string;
  status?: number;
}

type EventMap = {
  onChunk: StreamChunk;
  onComplete: CompletionResult;
  onError: LLMError;
};

type Listener<T> = (event: T) => void;

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_TEMPERATURE = 0.7;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

const PROVIDER_DEFAULTS: Record<LLMProvider, { baseUrl: string }> = {
  openai: { baseUrl: "https://api.openai.com/v1" },
  anthropic: { baseUrl: "https://api.anthropic.com/v1" },
  ollama: { baseUrl: "http://localhost:11434" },
};

export class LLMCompletion {
  private config: Required<
    Pick<LLMCompletionConfig, "provider" | "model" | "maxTokens" | "temperature">
  > & {
    apiKey: string;
    baseUrl: string;
    systemPrompt: string;
  };
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};
  private history: ChatMessage[] = [];

  constructor(config: LLMCompletionConfig) {
    if (config.provider !== "ollama" && !config.apiKey) {
      throw new Error(`API key required for provider "${config.provider}"`);
    }

    this.config = {
      provider: config.provider,
      apiKey: config.apiKey ?? "",
      model: config.model,
      baseUrl: config.baseUrl ?? PROVIDER_DEFAULTS[config.provider].baseUrl,
      maxTokens: config.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: config.temperature ?? DEFAULT_TEMPERATURE,
      systemPrompt: config.systemPrompt ?? "",
    };

    if (this.config.systemPrompt) {
      this.history.push({ role: "system", content: this.config.systemPrompt });
    }
  }

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event]!.push(listener);
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    const list = this.listeners[event];
    if (list) {
      this.listeners[event] = list.filter((l) => l !== listener) as typeof list;
    }
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const list = this.listeners[event];
    if (list) list.forEach((l) => l(payload));
  }

  /** Send a prompt and get a complete response. */
  async complete(prompt: string): Promise<CompletionResult> {
    this.history.push({ role: "user", content: prompt });

    const result = await this.callWithRetry(() => this.callProvider(this.history));

    this.history.push({ role: "assistant", content: result.content });
    this.emit("onComplete", result);
    return result;
  }

  /** Send a prompt and stream the response chunk by chunk. */
  async stream(prompt: string): Promise<string> {
    this.history.push({ role: "user", content: prompt });

    const fullContent = await this.callWithRetry(() =>
      this.streamProvider(this.history)
    );

    this.history.push({ role: "assistant", content: fullContent });
    return fullContent;
  }

  /** Get the conversation history. */
  getHistory(): ChatMessage[] {
    return [...this.history];
  }

  /** Clear conversation history (keeps system prompt). */
  clearHistory(): void {
    this.history = this.config.systemPrompt
      ? [{ role: "system", content: this.config.systemPrompt }]
      : [];
  }

  /** Set or update the system prompt. */
  setSystemPrompt(prompt: string): void {
    this.config.systemPrompt = prompt;
    const sysIndex = this.history.findIndex((m) => m.role === "system");
    if (sysIndex >= 0) {
      this.history[sysIndex].content = prompt;
    } else {
      this.history.unshift({ role: "system", content: prompt });
    }
  }

  private async callWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err as Error;
        const status = (err as { status?: number }).status;

        // Don't retry client errors (except rate limit)
        if (status && status >= 400 && status < 500 && status !== 429) {
          break;
        }

        if (attempt < MAX_RETRIES - 1) {
          await this.sleep(RETRY_DELAY_MS * Math.pow(2, attempt));
        }
      }
    }

    const llmError: LLMError = {
      code: "COMPLETION_FAILED",
      message: lastError?.message ?? "Unknown error",
      provider: this.config.provider,
      status: (lastError as { status?: number })?.status,
    };
    this.emit("onError", llmError);
    throw lastError;
  }

  private async callProvider(messages: ChatMessage[]): Promise<CompletionResult> {
    switch (this.config.provider) {
      case "openai":
        return this.callOpenAI(messages);
      case "anthropic":
        return this.callAnthropic(messages);
      case "ollama":
        return this.callOllama(messages);
    }
  }

  private async streamProvider(messages: ChatMessage[]): Promise<string> {
    switch (this.config.provider) {
      case "openai":
        return this.streamOpenAI(messages);
      case "anthropic":
        return this.streamAnthropic(messages);
      case "ollama":
        return this.streamOllama(messages);
    }
  }

  // ─── OpenAI ──────────────────────────────────────────────

  private async callOpenAI(messages: ChatMessage[]): Promise<CompletionResult> {
    const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      const err: Error & { status?: number } = new Error(
        `OpenAI API error ${res.status}: ${body}`
      );
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    return {
      content: data.choices[0].message.content ?? "",
      model: data.model,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
      finishReason: data.choices[0].finish_reason ?? "stop",
    };
  }

  private async streamOpenAI(messages: ChatMessage[]): Promise<string> {
    const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        stream: true,
      }),
    });

    if (!res.ok || !res.body) {
      const body = await res.text();
      const err: Error & { status?: number } = new Error(
        `OpenAI API error ${res.status}: ${body}`
      );
      err.status = res.status;
      throw err;
    }

    return this.readSSEStream(res.body, (chunk: string) => {
      if (chunk === "[DONE]") return null;
      const parsed = JSON.parse(chunk);
      return parsed.choices?.[0]?.delta?.content ?? null;
    });
  }

  // ─── Anthropic ───────────────────────────────────────────

  private async callAnthropic(messages: ChatMessage[]): Promise<CompletionResult> {
    const systemMsg = messages.find((m) => m.role === "system");
    const nonSystemMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const res = await fetch(`${this.config.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        ...(systemMsg && { system: systemMsg.content }),
        messages: nonSystemMessages,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      const err: Error & { status?: number } = new Error(
        `Anthropic API error ${res.status}: ${body}`
      );
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    const textBlock = data.content?.find(
      (b: { type: string }) => b.type === "text"
    );

    return {
      content: textBlock?.text ?? "",
      model: data.model,
      usage: {
        promptTokens: data.usage?.input_tokens ?? 0,
        completionTokens: data.usage?.output_tokens ?? 0,
        totalTokens:
          (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
      },
      finishReason: data.stop_reason ?? "end_turn",
    };
  }

  private async streamAnthropic(messages: ChatMessage[]): Promise<string> {
    const systemMsg = messages.find((m) => m.role === "system");
    const nonSystemMessages = messages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content }));

    const res = await fetch(`${this.config.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        stream: true,
        ...(systemMsg && { system: systemMsg.content }),
        messages: nonSystemMessages,
      }),
    });

    if (!res.ok || !res.body) {
      const body = await res.text();
      const err: Error & { status?: number } = new Error(
        `Anthropic API error ${res.status}: ${body}`
      );
      err.status = res.status;
      throw err;
    }

    return this.readSSEStream(res.body, (chunk: string) => {
      const parsed = JSON.parse(chunk);
      if (parsed.type === "content_block_delta") {
        return parsed.delta?.text ?? null;
      }
      return null;
    });
  }

  // ─── Ollama ──────────────────────────────────────────────

  private async callOllama(messages: ChatMessage[]): Promise<CompletionResult> {
    const res = await fetch(`${this.config.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        stream: false,
        options: {
          num_predict: this.config.maxTokens,
          temperature: this.config.temperature,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Ollama error ${res.status}: ${body}`);
    }

    const data = await res.json();
    return {
      content: data.message?.content ?? "",
      model: data.model ?? this.config.model,
      usage: {
        promptTokens: data.prompt_eval_count ?? 0,
        completionTokens: data.eval_count ?? 0,
        totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
      },
      finishReason: data.done ? "stop" : "length",
    };
  }

  private async streamOllama(messages: ChatMessage[]): Promise<string> {
    const res = await fetch(`${this.config.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        stream: true,
        options: {
          num_predict: this.config.maxTokens,
          temperature: this.config.temperature,
        },
      }),
    });

    if (!res.ok || !res.body) {
      const body = await res.text();
      throw new Error(`Ollama error ${res.status}: ${body}`);
    }

    let full = "";
    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      for (const line of text.split("\n").filter(Boolean)) {
        try {
          const parsed = JSON.parse(line);
          const token = parsed.message?.content ?? "";
          if (token) {
            full += token;
            this.emit("onChunk", { content: token, done: false });
          }
        } catch {
          // Skip malformed NDJSON lines
        }
      }
    }

    this.emit("onChunk", { content: "", done: true });
    this.emit("onComplete", {
      content: full,
      model: this.config.model,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      finishReason: "stop",
    });
    return full;
  }

  // ─── SSE Helpers ─────────────────────────────────────────

  private async readSSEStream(
    body: ReadableStream<Uint8Array>,
    extractContent: (chunk: string) => string | null
  ): Promise<string> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let full = "";
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = line.slice(6).trim();
        if (!data) continue;

        try {
          const content = extractContent(data);
          if (content) {
            full += content;
            this.emit("onChunk", { content, done: false });
          }
        } catch {
          // Skip unparseable chunks
        }
      }
    }

    this.emit("onChunk", { content: "", done: true });
    this.emit("onComplete", {
      content: full,
      model: this.config.model,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      finishReason: "stop",
    });
    return full;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default LLMCompletion;
