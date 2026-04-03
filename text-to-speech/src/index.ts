// @radzor/text-to-speech — Text-to-speech synthesis

type Provider = "openai" | "elevenlabs";

interface TextToSpeechConfig {
  provider: Provider;
  apiKey: string;
  voice?: string;
  model?: string;
  speed?: number;
}

interface SynthesizeOptions {
  voice?: string;
  speed?: number;
  format?: "mp3" | "wav" | "opus" | "aac" | "flac";
}

type EventMap = {
  onSynthesized: { size: number; format: string; voice: string };
  onError: { code: string; message: string };
};

const PROVIDER_DEFAULTS: Record<Provider, { url: string; model: string; voice: string }> = {
  openai: { url: "https://api.openai.com/v1", model: "tts-1", voice: "alloy" },
  elevenlabs: { url: "https://api.elevenlabs.io/v1", model: "eleven_multilingual_v2", voice: "21m00Tcm4TlvDq8ikWAM" },
};

export class TextToSpeech {
  private config: Required<TextToSpeechConfig>;
  private listeners: Map<string, Function[]> = new Map();

  constructor(config: TextToSpeechConfig) {
    const defaults = PROVIDER_DEFAULTS[config.provider];
    this.config = {
      provider: config.provider,
      apiKey: config.apiKey,
      voice: config.voice ?? defaults.voice,
      model: config.model ?? defaults.model,
      speed: config.speed ?? 1.0,
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

  async synthesize(text: string, options?: SynthesizeOptions): Promise<Buffer> {
    try {
      switch (this.config.provider) {
        case "openai":
          return await this.synthesizeOpenAI(text, options);
        case "elevenlabs":
          return await this.synthesizeElevenLabs(text, options);
        default:
          throw new Error(`Unknown provider: ${this.config.provider}`);
      }
    } catch (err: any) {
      this.emit("onError", { code: "SYNTHESIS_FAILED", message: err.message });
      throw err;
    }
  }

  async synthesizeToFile(text: string, outputPath: string, options?: SynthesizeOptions): Promise<void> {
    const buffer = await this.synthesize(text, options);
    const fs = await import("fs");
    fs.writeFileSync(outputPath, buffer);
  }

  // ─── OpenAI TTS ──────────────────────────────────────────

  private async synthesizeOpenAI(text: string, options?: SynthesizeOptions): Promise<Buffer> {
    const voice = options?.voice ?? this.config.voice;
    const format = options?.format ?? "mp3";
    const speed = options?.speed ?? this.config.speed;

    const res = await fetch(`${PROVIDER_DEFAULTS.openai.url}/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.model,
        input: text,
        voice,
        speed,
        response_format: format,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message ?? `OpenAI API error: ${res.status}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    this.emit("onSynthesized", { size: buffer.length, format, voice });
    return buffer;
  }

  // ─── ElevenLabs ──────────────────────────────────────────

  private async synthesizeElevenLabs(text: string, options?: SynthesizeOptions): Promise<Buffer> {
    const voice = options?.voice ?? this.config.voice;
    const format = options?.format ?? "mp3";

    const res = await fetch(
      `${PROVIDER_DEFAULTS.elevenlabs.url}/text-to-speech/${voice}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": this.config.apiKey,
          "Content-Type": "application/json",
          Accept: `audio/${format}`,
        },
        body: JSON.stringify({
          text,
          model_id: this.config.model,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      }
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail?.message ?? `ElevenLabs API error: ${res.status}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    this.emit("onSynthesized", { size: buffer.length, format, voice });
    return buffer;
  }
}
