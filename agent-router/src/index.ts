// @radzor/agent-router — Route prompts to different AI agents based on intent classification

export interface AgentRouterConfig {
  apiKey: string;
  classifierModel?: string;
  baseUrl?: string;
  fallbackAgent?: string;
}

export interface AgentRegistration {
  name: string;
  handler: (prompt: string) => Promise<string>;
  intents: string[];
  description?: string;
}

export interface AgentInfo {
  name: string;
  intents: string[];
  description?: string;
}

export interface RouteResult {
  selectedAgent: string;
  confidence: number;
  response: string;
  intent: string;
}

export interface ClassificationResult {
  intent: string;
  confidence: number;
}

export type EventMap = {
  onRouted: { prompt: string; agent: string; intent: string; confidence: number };
  onFallback: { prompt: string; agent: string; reason: string };
};

export type Listener<T> = (event: T) => void;

export class AgentRouter {
  private config: {
    apiKey: string;
    classifierModel: string;
    baseUrl: string;
    fallbackAgent: string | null;
  };
  private agents: Map<string, AgentRegistration> = new Map();
  private intentMap: Map<string, string> = new Map(); // intent → agent name
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: AgentRouterConfig) {
    this.config = {
      apiKey: config.apiKey,
      classifierModel: config.classifierModel ?? "gpt-4o-mini",
      baseUrl: config.baseUrl ?? "https://api.openai.com/v1",
      fallbackAgent: config.fallbackAgent ?? null,
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

  /** Register an agent with its intents and handler. */
  registerAgent(
    name: string,
    handler: (prompt: string) => Promise<string>,
    intents: string[],
    description?: string
  ): void {
    if (this.agents.has(name)) {
      throw new Error(`Agent "${name}" is already registered`);
    }

    this.agents.set(name, { name, handler, intents, description });
    for (const intent of intents) {
      this.intentMap.set(intent.toLowerCase(), name);
    }
  }

  /** Remove a registered agent. Returns true if it existed. */
  removeAgent(name: string): boolean {
    const agent = this.agents.get(name);
    if (!agent) return false;

    for (const intent of agent.intents) {
      this.intentMap.delete(intent.toLowerCase());
    }
    this.agents.delete(name);
    return true;
  }

  /** List all registered agents. */
  listAgents(): AgentInfo[] {
    return Array.from(this.agents.values()).map(({ name, intents, description }) => ({
      name,
      intents,
      description,
    }));
  }

  /** Classify the prompt's intent and route to the best matching agent. */
  async route(prompt: string): Promise<RouteResult> {
    if (this.agents.size === 0) {
      throw new Error("No agents registered. Call registerAgent() first.");
    }

    const classification = await this.classifyIntent(prompt);
    const agentName = this.intentMap.get(classification.intent.toLowerCase());

    if (agentName) {
      const agent = this.agents.get(agentName)!;
      const response = await agent.handler(prompt);

      this.emit("onRouted", {
        prompt,
        agent: agentName,
        intent: classification.intent,
        confidence: classification.confidence,
      });

      return {
        selectedAgent: agentName,
        confidence: classification.confidence,
        response,
        intent: classification.intent,
      };
    }

    // Fallback
    if (this.config.fallbackAgent) {
      const fallbackAgent = this.agents.get(this.config.fallbackAgent);
      if (fallbackAgent) {
        const response = await fallbackAgent.handler(prompt);

        this.emit("onFallback", {
          prompt,
          agent: this.config.fallbackAgent,
          reason: `No agent matched intent "${classification.intent}"`,
        });

        return {
          selectedAgent: this.config.fallbackAgent,
          confidence: classification.confidence,
          response,
          intent: classification.intent,
        };
      }
    }

    throw new Error(
      `No agent handles intent "${classification.intent}" and no fallback is configured`
    );
  }

  // ─── Intent Classification ──────────────────────────────

  private async classifyIntent(prompt: string): Promise<ClassificationResult> {
    const agentDescriptions = Array.from(this.agents.values())
      .map((a) => {
        const desc = a.description ? ` — ${a.description}` : "";
        return `- Intents: [${a.intents.join(", ")}]${desc}`;
      })
      .join("\n");

    const allIntents = Array.from(this.intentMap.keys());

    const systemPrompt = `You are an intent classifier. Given a user prompt, classify it into exactly one of these intents.

Available agents and their intents:
${agentDescriptions}

All valid intents: ${allIntents.join(", ")}

Respond ONLY with JSON: {"intent": "<intent>", "confidence": <0.0-1.0>}
Do not include any other text. If no intent fits well, pick the closest match with low confidence.`;

    const res = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.classifierModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0,
        max_tokens: 100,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Classifier API error ${res.status}: ${body}`);
    }

    const data = await res.json();
    const content = data.choices[0].message.content ?? "";

    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON in response");
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        intent: String(parsed.intent).toLowerCase(),
        confidence: Math.min(1, Math.max(0, Number(parsed.confidence) || 0)),
      };
    } catch {
      // If parsing fails, try to find the closest intent from the raw text
      const lower = content.toLowerCase();
      for (const intent of allIntents) {
        if (lower.includes(intent)) {
          return { intent, confidence: 0.5 };
        }
      }
      return { intent: allIntents[0], confidence: 0.1 };
    }
  }
}

export default AgentRouter;
