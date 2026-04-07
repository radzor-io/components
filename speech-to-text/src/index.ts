// @radzor/speech-to-text — Audio transcription

type Provider = "openai" | "deepgram";

interface SpeechToTextConfig {
  provider: Provider;
  apiKey: string;
  model?: string;
  language?: string;
}

interface TranscribeOptions {
  language?: string;
  timestamps?: boolean;
  responseFormat?: "text" | "json" | "verbose_json" | "srt" | "vtt";
}

interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

interface TranscriptionResult {
  text: string;
  language: string;
  duration: number;
  words?: WordTimestamp[];
  provider: Provider;
}

type EventMap = {
  onTranscribed: { text: string; language: string; duration: number };
  onError: { code: string; message: string };
};

const PROVIDER_DEFAULTS: Record<Provider, { url: string; model: string }> = {
  openai: { url: "https://api.openai.com/v1", model: "whisper-1" },
  deepgram: { url: "https://api.deepgram.com/v1", model: "nova-2" },
};

export class SpeechToText {
  private config: Required<SpeechToTextConfig>;
  private listeners: Map<string, Function[]> = new Map();

  constructor(config: SpeechToTextConfig) {
    const defaults = PROVIDER_DEFAULTS[config.provider];
    this.config = {
      provider: config.provider,
      apiKey: config.apiKey,
      model: config.model ?? defaults.model,
      language: config.language ?? "",
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

  async transcribe(audio: Buffer | Blob | string, options?: TranscribeOptions): Promise<TranscriptionResult> {
    try {
      switch (this.config.provider) {
        case "openai":
          return await this.transcribeOpenAI(audio, options);
        case "deepgram":
          return await this.transcribeDeepgram(audio, options);
        default:
          throw new Error(`Unknown provider: ${this.config.provider}`);
      }
    } catch (err: any) {
      this.emit("onError", { code: "TRANSCRIPTION_FAILED", message: err.message });
      throw err;
    }
  }

  // ─── OpenAI Whisper ──────────────────────────────────────

  private async transcribeOpenAI(audio: Buffer | Blob | string, options?: TranscribeOptions): Promise<TranscriptionResult> {
    const formData = new FormData();

    if (typeof audio === "string") {
      const fs = await import("fs");
      const buffer = fs.readFileSync(audio);
      formData.append("file", new Blob([new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)]), audio.split("/").pop() ?? "audio.wav");
    } else if (Buffer.isBuffer(audio)) {
      formData.append("file", new Blob([new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength)]), "audio.wav");
    } else {
      formData.append("file", audio, "audio.wav");
    }

    formData.append("model", this.config.model);
    if (options?.language || this.config.language) {
      formData.append("language", options?.language ?? this.config.language);
    }
    formData.append("response_format", "verbose_json");
    if (options?.timestamps) {
      formData.append("timestamp_granularities[]", "word");
    }

    const res = await fetch(`${PROVIDER_DEFAULTS.openai.url}/audio/transcriptions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.config.apiKey}` },
      body: formData,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message ?? `OpenAI API error: ${res.status}`);
    }

    const data = await res.json();
    const result: TranscriptionResult = {
      text: data.text,
      language: data.language ?? "",
      duration: data.duration ?? 0,
      words: data.words?.map((w: any) => ({ word: w.word, start: w.start, end: w.end })),
      provider: "openai",
    };

    this.emit("onTranscribed", { text: result.text, language: result.language, duration: result.duration });
    return result;
  }

  // ─── Deepgram ────────────────────────────────────────────

  private async transcribeDeepgram(audio: Buffer | Blob | string, options?: TranscribeOptions): Promise<TranscriptionResult> {
    let bodyBytes: Uint8Array;
    if (typeof audio === "string") {
      const fs = await import("fs");
      const buf = fs.readFileSync(audio);
      bodyBytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } else if (audio instanceof Blob) {
      bodyBytes = new Uint8Array(await audio.arrayBuffer());
    } else {
      bodyBytes = new Uint8Array(audio.buffer, audio.byteOffset, audio.byteLength);
    }

    const params = new URLSearchParams({
      model: this.config.model,
      smart_format: "true",
    });
    if (options?.language || this.config.language) {
      params.set("language", options?.language ?? this.config.language);
    } else {
      params.set("detect_language", "true");
    }
    if (options?.timestamps) {
      params.set("utterances", "true");
    }

    const res = await fetch(`${PROVIDER_DEFAULTS.deepgram.url}/listen?${params}`, {
      method: "POST",
      headers: {
        Authorization: `Token ${this.config.apiKey}`,
        "Content-Type": "audio/wav",
      },
      body: bodyBytes,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.err_msg ?? `Deepgram API error: ${res.status}`);
    }

    const data = await res.json();
    const channel = data.results?.channels?.[0];
    const alt = channel?.alternatives?.[0];

    const result: TranscriptionResult = {
      text: alt?.transcript ?? "",
      language: channel?.detected_language ?? data.results?.channels?.[0]?.detected_language ?? "",
      duration: data.metadata?.duration ?? 0,
      words: alt?.words?.map((w: any) => ({ word: w.word, start: w.start, end: w.end })),
      provider: "deepgram",
    };

    this.emit("onTranscribed", { text: result.text, language: result.language, duration: result.duration });
    return result;
  }
}
