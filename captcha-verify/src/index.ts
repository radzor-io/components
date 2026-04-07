// @radzor/captcha-verify — Server-side CAPTCHA verification

export type Provider = "turnstile" | "recaptcha" | "hcaptcha";

export interface CaptchaVerifyConfig {
  provider: Provider;
  secretKey: string;
  scoreThreshold?: number;
}

export interface CaptchaResult {
  success: boolean;
  score?: number;
  hostname?: string;
  errorCodes: string[];
  provider: Provider;
}

export type EventMap = {
  onVerified: { success: boolean; score: number };
  onError: { code: string; message: string };
};

const VERIFY_URLS: Record<Provider, string> = {
  turnstile: "https://challenges.cloudflare.com/turnstile/v0/siteverify",
  recaptcha: "https://www.google.com/recaptcha/api/siteverify",
  hcaptcha: "https://api.hcaptcha.com/siteverify",
};

export class CaptchaVerify {
  private config: Required<CaptchaVerifyConfig>;
  private listeners: Map<string, Function[]> = new Map();

  constructor(config: CaptchaVerifyConfig) {
    this.config = {
      provider: config.provider,
      secretKey: config.secretKey,
      scoreThreshold: config.scoreThreshold ?? 0.5,
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

  async verify(token: string, remoteIp?: string): Promise<CaptchaResult> {
    try {
      const url = VERIFY_URLS[this.config.provider];
      const params = new URLSearchParams({
        secret: this.config.secretKey,
        response: token,
      });
      if (remoteIp) params.set("remoteip", remoteIp);

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      if (!res.ok) {
        throw new Error(`CAPTCHA API error: ${res.status}`);
      }

      const data = await res.json();

      const result: CaptchaResult = {
        success: data.success ?? false,
        score: data.score,
        hostname: data.hostname,
        errorCodes: data["error-codes"] ?? [],
        provider: this.config.provider,
      };

      // For reCAPTCHA v3: also check score threshold
      if (this.config.provider === "recaptcha" && result.score !== undefined) {
        result.success = result.success && result.score >= this.config.scoreThreshold;
      }

      this.emit("onVerified", { success: result.success, score: result.score ?? -1 });
      return result;
    } catch (err: any) {
      this.emit("onError", { code: "VERIFY_FAILED", message: err.message });
      throw err;
    }
  }
}
