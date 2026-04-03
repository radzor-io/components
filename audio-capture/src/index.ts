// @radzor/audio-capture — Browser audio recording with MediaRecorder API

export interface AudioCaptureConfig {
  sampleRate?: number;
  channels?: number;
  codec?: "opus" | "pcm" | "aac";
}

export interface SpeechStartEvent {
  timestamp: number;
}

export interface SpeechEndEvent {
  timestamp: number;
  duration: number;
}

export interface AudioCaptureError {
  code: string;
  message: string;
}

type EventMap = {
  onSpeechStart: SpeechStartEvent;
  onSpeechEnd: SpeechEndEvent;
  onError: AudioCaptureError;
};

type Listener<T> = (event: T) => void;

const MIME_MAP: Record<string, string> = {
  opus: "audio/webm;codecs=opus",
  aac: "audio/mp4;codecs=mp4a.40.2",
  pcm: "audio/webm",
};

const SILENCE_THRESHOLD = 0.01;
const SILENCE_DURATION_MS = 1500;

export class AudioCapture {
  private config: Required<AudioCaptureConfig>;
  private mediaStream: MediaStream | null = null;
  private recorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private chunks: Blob[] = [];
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private isSpeaking = false;
  private animationFrameId: number | null = null;

  constructor(config: AudioCaptureConfig = {}) {
    this.config = {
      sampleRate: config.sampleRate ?? 44100,
      channels: config.channels ?? 1,
      codec: config.codec ?? "opus",
    };
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

  async startRecording(): Promise<void> {
    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: this.config.sampleRate,
          channelCount: this.config.channels,
        },
      });

      this.audioContext = new AudioContext({ sampleRate: this.config.sampleRate });
      const source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      source.connect(this.analyser);

      const mimeType = MIME_MAP[this.config.codec] ?? MIME_MAP.opus;
      this.recorder = new MediaRecorder(this.mediaStream, {
        mimeType: MediaRecorder.isTypeSupported(mimeType) ? mimeType : undefined,
      });

      this.chunks = [];
      this.recorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };

      this.recorder.start(100);
      this.detectSpeech();
    } catch (err) {
      const error = err as Error;
      this.emit("onError", {
        code: error.name === "NotAllowedError" ? "PERMISSION_DENIED" : "DEVICE_ERROR",
        message: error.message,
      });
      throw err;
    }
  }

  async stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.recorder || this.recorder.state === "inactive") {
        reject(new Error("No active recording"));
        return;
      }

      this.recorder.onstop = () => {
        const mimeType = this.recorder?.mimeType ?? "audio/webm";
        const blob = new Blob(this.chunks, { type: mimeType });
        this.cleanup();
        resolve(blob);
      };

      this.recorder.stop();
    });
  }

  pause(): void {
    if (this.recorder?.state === "recording") {
      this.recorder.pause();
    }
  }

  resume(): void {
    if (this.recorder?.state === "paused") {
      this.recorder.resume();
    }
  }

  getVolume(): number {
    if (!this.analyser) return 0;
    const data = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i];
    }
    return Math.sqrt(sum / data.length);
  }

  private detectSpeech(): void {
    const check = () => {
      const volume = this.getVolume();

      if (volume > SILENCE_THRESHOLD && !this.isSpeaking) {
        this.isSpeaking = true;
        if (this.silenceTimer) {
          clearTimeout(this.silenceTimer);
          this.silenceTimer = null;
        }
        this.emit("onSpeechStart", { timestamp: Date.now() });
      }

      if (volume <= SILENCE_THRESHOLD && this.isSpeaking && !this.silenceTimer) {
        const speechStart = Date.now();
        this.silenceTimer = setTimeout(() => {
          this.isSpeaking = false;
          this.silenceTimer = null;
          this.emit("onSpeechEnd", {
            timestamp: Date.now(),
            duration: Date.now() - speechStart,
          });
        }, SILENCE_DURATION_MS);
      }

      if (this.recorder?.state !== "inactive") {
        this.animationFrameId = requestAnimationFrame(check);
      }
    };
    check();
  }

  private cleanup(): void {
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    if (this.silenceTimer) clearTimeout(this.silenceTimer);
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
    }
    if (this.audioContext) this.audioContext.close();
    this.mediaStream = null;
    this.recorder = null;
    this.audioContext = null;
    this.analyser = null;
  }
}

export default AudioCapture;
