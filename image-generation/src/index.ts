// @radzor/image-generation — Multi-provider image generation

type Provider = "openai" | "stability" | "replicate";
type ResponseFormat = "url" | "base64";

interface ImageGenerationConfig {
  provider: Provider;
  apiKey: string;
  model?: string;
  defaultSize?: string;
  responseFormat?: ResponseFormat;
}

interface GenerateOptions {
  size?: string;
  responseFormat?: ResponseFormat;
  n?: number;
}

interface ImageGenerationResult {
  url?: string;
  base64?: string;
  revisedPrompt?: string;
  provider: Provider;
  model: string;
}

type EventMap = {
  onGenerated: { url: string; prompt: string; provider: string };
  onError: { code: string; message: string; provider: string };
};

const PROVIDER_DEFAULTS: Record<Provider, { url: string; model: string }> = {
  openai: { url: "https://api.openai.com/v1", model: "dall-e-3" },
  stability: { url: "https://api.stability.ai/v1", model: "stable-diffusion-xl-1024-v1-0" },
  replicate: { url: "https://api.replicate.com/v1", model: "black-forest-labs/flux-schnell" },
};

export class ImageGeneration {
  private config: Required<ImageGenerationConfig>;
  private listeners: Map<string, Function[]> = new Map();

  constructor(config: ImageGenerationConfig) {
    const defaults = PROVIDER_DEFAULTS[config.provider];
    this.config = {
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model ?? defaults.model,
      defaultSize: config.defaultSize ?? "1024x1024",
      responseFormat: config.responseFormat ?? "url",
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

  async generate(prompt: string, options?: GenerateOptions): Promise<ImageGenerationResult> {
    const size = options?.size ?? this.config.defaultSize;
    const format = options?.responseFormat ?? this.config.responseFormat;

    try {
      switch (this.config.provider) {
        case "openai":
          return await this.generateOpenAI(prompt, size, format, 1).then((r) => r[0]);
        case "stability":
          return await this.generateStability(prompt, size);
        case "replicate":
          return await this.generateReplicate(prompt, size);
        default:
          throw new Error(`Unknown provider: ${this.config.provider}`);
      }
    } catch (err: any) {
      this.emit("onError", { code: "GENERATION_FAILED", message: err.message, provider: this.config.provider });
      throw err;
    }
  }

  async generateMultiple(prompt: string, count: number): Promise<ImageGenerationResult[]> {
    if (this.config.provider === "openai") {
      return this.generateOpenAI(prompt, this.config.defaultSize, this.config.responseFormat, count);
    }
    const results: ImageGenerationResult[] = [];
    for (let i = 0; i < count; i++) {
      results.push(await this.generate(prompt));
    }
    return results;
  }

  // ─── OpenAI DALL-E ───────────────────────────────────────

  private async generateOpenAI(prompt: string, size: string, format: ResponseFormat, n: number): Promise<ImageGenerationResult[]> {
    const res = await fetch(`${PROVIDER_DEFAULTS.openai.url}/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.model,
        prompt,
        n,
        size,
        response_format: format === "base64" ? "b64_json" : "url",
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message ?? `OpenAI API error: ${res.status}`);
    }

    const data = await res.json();
    return data.data.map((img: any) => {
      const result: ImageGenerationResult = {
        url: img.url,
        base64: img.b64_json,
        revisedPrompt: img.revised_prompt,
        provider: "openai",
        model: this.config.model,
      };
      this.emit("onGenerated", { url: img.url ?? "(base64)", prompt, provider: "openai" });
      return result;
    });
  }

  // ─── Stability AI ───────────────────────────────────────

  private async generateStability(prompt: string, size: string): Promise<ImageGenerationResult> {
    const [width, height] = size.split("x").map(Number);
    const res = await fetch(
      `${PROVIDER_DEFAULTS.stability.url}/generation/${this.config.model}/text-to-image`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          text_prompts: [{ text: prompt, weight: 1 }],
          cfg_scale: 7,
          width,
          height,
          steps: 30,
          samples: 1,
        }),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? `Stability API error: ${res.status}`);
    }

    const data = await res.json();
    const img = data.artifacts[0];
    const result: ImageGenerationResult = {
      base64: img.base64,
      provider: "stability",
      model: this.config.model,
    };
    this.emit("onGenerated", { url: "(base64)", prompt, provider: "stability" });
    return result;
  }

  // ─── Replicate ──────────────────────────────────────────

  private async generateReplicate(prompt: string, size: string): Promise<ImageGenerationResult> {
    const [width, height] = size.split("x").map(Number);

    // Create prediction
    const createRes = await fetch(`${PROVIDER_DEFAULTS.replicate.url}/predictions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
        Prefer: "wait",
      },
      body: JSON.stringify({
        model: this.config.model,
        input: { prompt, width, height },
      }),
    });

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      throw new Error(err.detail ?? `Replicate API error: ${createRes.status}`);
    }

    const prediction = await createRes.json();

    // If using Prefer: wait, output should be available
    let output = prediction.output;

    // Poll if not ready
    if (!output && prediction.urls?.get) {
      output = await this.pollReplicate(prediction.urls.get);
    }

    const url = Array.isArray(output) ? output[0] : output;
    const result: ImageGenerationResult = {
      url,
      provider: "replicate",
      model: this.config.model,
    };
    this.emit("onGenerated", { url: url ?? "", prompt, provider: "replicate" });
    return result;
  }

  private async pollReplicate(getUrl: string, maxAttempts = 60): Promise<string> {
    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const res = await fetch(getUrl, {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      });
      const data = await res.json();
      if (data.status === "succeeded") return data.output;
      if (data.status === "failed") throw new Error(data.error ?? "Replicate prediction failed");
    }
    throw new Error("Replicate prediction timed out");
  }
}
