// @radzor/structured-output — Structured JSON output from LLMs (OpenAI + Anthropic)

export type Provider = "openai" | "anthropic";

export interface StructuredOutputConfig {
  provider: Provider;
  apiKey: string;
  model: string;
  maxRetries?: number;
  temperature?: number;
}

export interface ClassifyResult {
  label: string;
  confidence: number;
  reasoning: string;
}

export type EventMap = {
  onParsed: { result: unknown; attempt: number };
  onRetry: { attempt: number; error: string };
  onError: { code: string; message: string };
};

// Minimal JSON schema type used internally
export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: unknown[];
  items?: JsonSchema;
  [key: string]: unknown;
}

export class StructuredOutput {
  private config: Required<StructuredOutputConfig>;
  private listeners: Map<string, Function[]> = new Map();

  constructor(config: StructuredOutputConfig) {
    if (!config.apiKey) {
      throw new Error(`API key required for provider "${config.provider}"`);
    }
    this.config = {
      maxRetries: 3,
      temperature: 0,
      ...config,
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

  // Simple required-fields schema validation
  private validate(data: unknown, schema: JsonSchema): boolean {
    if (schema.type === "object" || schema.properties) {
      if (typeof data !== "object" || data === null) return false;
      const obj = data as Record<string, unknown>;
      for (const key of schema.required ?? []) {
        if (!(key in obj)) return false;
      }
      if (schema.properties) {
        for (const [key, subSchema] of Object.entries(schema.properties)) {
          if (key in obj && !this.validate(obj[key], subSchema)) return false;
        }
      }
      return true;
    }
    if (schema.enum) {
      return schema.enum.includes(data);
    }
    if (schema.type === "number" || schema.type === "integer") {
      return typeof data === "number";
    }
    if (schema.type === "string") {
      return typeof data === "string";
    }
    if (schema.type === "boolean") {
      return typeof data === "boolean";
    }
    if (schema.type === "array") {
      return Array.isArray(data);
    }
    return true;
  }

  private async callOpenAI(
    messages: Array<{ role: string; content: string }>,
    schema: JsonSchema
  ): Promise<{ text: string; parsed: unknown }> {
    const body: Record<string, unknown> = {
      model: this.config.model,
      temperature: this.config.temperature,
      messages,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "output",
          schema,
          strict: true,
        },
      },
    };

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).error?.message ?? `OpenAI error ${res.status}`);
    }

    const data = await res.json();
    const text: string = data.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(text);
    return { text, parsed };
  }

  private async callAnthropic(
    messages: Array<{ role: string; content: string }>,
    schema: JsonSchema,
    systemPrompt?: string
  ): Promise<{ text: string; parsed: unknown }> {
    const toolName = "output";
    const body: Record<string, unknown> = {
      model: this.config.model,
      max_tokens: 4096,
      temperature: this.config.temperature,
      messages,
      tools: [
        {
          name: toolName,
          description: "Return the structured output",
          input_schema: { type: "object", ...schema },
        },
      ],
      tool_choice: { type: "tool", name: toolName },
    };

    if (systemPrompt) {
      body.system = systemPrompt;
    }

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": this.config.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).error?.message ?? `Anthropic error ${res.status}`);
    }

    const data = await res.json();

    // Find the tool_use block in content
    const toolUse = (data.content ?? []).find((c: any) => c.type === "tool_use" && c.name === toolName);
    if (!toolUse) {
      throw new Error("Anthropic did not return a tool_use block");
    }

    const parsed = toolUse.input;
    const text = JSON.stringify(parsed);
    return { text, parsed };
  }

  async generate<T = unknown>(
    prompt: string,
    schema: JsonSchema,
    systemPrompt?: string
  ): Promise<T> {
    const messages: Array<{ role: string; content: string }> = [];
    if (this.config.provider === "openai" && systemPrompt) {
      messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    let lastError = "";
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      try {
        let result: { text: string; parsed: unknown };

        if (this.config.provider === "openai") {
          result = await this.callOpenAI(messages, schema);
        } else {
          result = await this.callAnthropic(messages, schema, systemPrompt);
        }

        if (!this.validate(result.parsed, schema)) {
          throw new Error("Schema validation failed: required fields missing");
        }

        this.emit("onParsed", { result: result.parsed, attempt });
        return result.parsed as T;
      } catch (err: any) {
        lastError = err.message;
        if (attempt < this.config.maxRetries) {
          this.emit("onRetry", { attempt, error: lastError });
        }
      }
    }

    const error = { code: "MAX_RETRIES", message: `Failed after ${this.config.maxRetries} attempts: ${lastError}` };
    this.emit("onError", error);
    throw new Error(error.message);
  }

  async extract<T = unknown>(text: string, schema: JsonSchema): Promise<T> {
    const prompt = `Extract the requested information from the following text and return it as structured data.\n\nText:\n${text}`;
    return this.generate<T>(prompt, schema, "You are a data extraction assistant. Extract only what is present in the text.");
  }

  async classify(
    text: string,
    labels: string[]
  ): Promise<ClassifyResult> {
    const schema: JsonSchema = {
      type: "object",
      properties: {
        label: { type: "string", enum: labels },
        confidence: { type: "number" },
        reasoning: { type: "string" },
      },
      required: ["label", "confidence", "reasoning"],
    };

    const prompt = `Classify the following text into exactly one of these labels: ${labels.join(", ")}.\n\nText:\n${text}\n\nReturn the label, your confidence (0.0 to 1.0), and your reasoning.`;
    return this.generate<ClassifyResult>(prompt, schema, "You are a classification assistant. Choose the single best label.");
  }
}
