// @radzor/function-calling — Agentic tool-calling loop for OpenAI and Anthropic

export interface ToolDefinition {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  handler: (input: unknown) => Promise<unknown>;
}

export interface ToolCallLog {
  tool: string;
  input: unknown;
  output: unknown;
  durationMs: number;
}

export interface FunctionCallingConfig {
  provider: "openai" | "anthropic";
  apiKey: string;
  model: string;
  maxIterations?: number;
  systemPrompt?: string;
}

export interface RunResult {
  response: string;
  toolCallLog: ToolCallLog[];
}

export type EventMap = {
  onToolCalled: { tool: string; input: unknown };
  onToolResult: { tool: string; output: unknown; durationMs: number };
  onComplete: { response: string; toolCallLog: ToolCallLog[] };
  onError: { code: string; message: string };
};

export class FunctionCalling {
  private config: FunctionCallingConfig;
  private tools: Map<string, ToolDefinition> = new Map();
  private listeners: Map<string, Function[]> = new Map();

  constructor(config: FunctionCallingConfig) {
    if (!config.apiKey) {
      throw new Error(`API key required for provider "${config.provider}"`);
    }
    this.config = { maxIterations: 10, ...config };
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

  define(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.tools.set(tool.name, tool);
    }
  }

  async run(prompt: string): Promise<RunResult> {
    return this.runWithHistory([{ role: "user", content: prompt }]);
  }

  async runWithHistory(messages: Array<{ role: string; content: string }>): Promise<RunResult> {
    try {
      return this.config.provider === "openai"
        ? await this._runOpenAI([...messages])
        : await this._runAnthropic([...messages]);
    } catch (err: any) {
      this.emit("onError", { code: "RUN_ERROR", message: err.message });
      throw err;
    }
  }

  private async _runOpenAI(messages: Array<{ role: string; content: string }>): Promise<RunResult> {
    const toolLog: ToolCallLog[] = [];
    const toolsArray = Array.from(this.tools.values()).map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.schema },
    }));

    for (let i = 0; i < (this.config.maxIterations ?? 10); i++) {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: this.config.systemPrompt
            ? [{ role: "system", content: this.config.systemPrompt }, ...messages]
            : messages,
          tools: toolsArray.length > 0 ? toolsArray : undefined,
          tool_choice: toolsArray.length > 0 ? "auto" : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error?.message ?? `OpenAI error: ${res.status}`);
      }

      const data = await res.json() as any;
      const choice = data.choices[0];
      const assistantMsg = choice.message;
      messages.push(assistantMsg);

      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        const response = assistantMsg.content ?? "";
        this.emit("onComplete", { response, toolCallLog: toolLog });
        return { response, toolCallLog: toolLog };
      }

      for (const tc of assistantMsg.tool_calls) {
        const toolName = tc.function.name;
        const input = JSON.parse(tc.function.arguments ?? "{}");
        this.emit("onToolCalled", { tool: toolName, input });

        const tool = this.tools.get(toolName);
        if (!tool) throw new Error(`Unknown tool: ${toolName}`);

        const start = Date.now();
        const output = await tool.handler(input);
        const durationMs = Date.now() - start;

        toolLog.push({ tool: toolName, input, output, durationMs });
        this.emit("onToolResult", { tool: toolName, output, durationMs });

        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(output),
        } as any);
      }
    }

    throw new Error(`Exceeded maxIterations (${this.config.maxIterations})`);
  }

  private async _runAnthropic(messages: Array<{ role: string; content: string }>): Promise<RunResult> {
    const toolLog: ToolCallLog[] = [];
    const toolsArray = Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.schema,
    }));

    for (let i = 0; i < (this.config.maxIterations ?? 10); i++) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": this.config.apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: 4096,
          system: this.config.systemPrompt,
          messages,
          tools: toolsArray.length > 0 ? toolsArray : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error?.message ?? `Anthropic error: ${res.status}`);
      }

      const data = await res.json() as any;
      const contentBlocks: any[] = data.content ?? [];
      messages.push({ role: "assistant", content: contentBlocks as any });

      const toolUseBlocks = contentBlocks.filter((b: any) => b.type === "tool_use");

      if (toolUseBlocks.length === 0) {
        const textBlock = contentBlocks.find((b: any) => b.type === "text");
        const response = textBlock?.text ?? "";
        this.emit("onComplete", { response, toolCallLog: toolLog });
        return { response, toolCallLog: toolLog };
      }

      const toolResults: any[] = [];
      for (const block of toolUseBlocks) {
        const toolName = block.name;
        const input = block.input;
        this.emit("onToolCalled", { tool: toolName, input });

        const tool = this.tools.get(toolName);
        if (!tool) throw new Error(`Unknown tool: ${toolName}`);

        const start = Date.now();
        const output = await tool.handler(input);
        const durationMs = Date.now() - start;

        toolLog.push({ tool: toolName, input, output, durationMs });
        this.emit("onToolResult", { tool: toolName, output, durationMs });

        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(output) });
      }

      messages.push({ role: "user", content: toolResults as any });
    }

    throw new Error(`Exceeded maxIterations (${this.config.maxIterations})`);
  }
}
