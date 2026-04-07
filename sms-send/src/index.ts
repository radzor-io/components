// @radzor/sms-send — SMS sending via Twilio or Vonage

export type Provider = "twilio" | "vonage";

export interface SmsSendConfig {
  provider: Provider;
  accountSid: string;
  authToken: string;
  fromNumber: string;
}

export interface SmsSendResult {
  messageSid: string;
  to: string;
  status: string;
  provider: Provider;
}

export type EventMap = {
  onSent: { to: string; messageSid: string };
  onError: { code: string; message: string; to: string };
};

export class SmsSend {
  private config: SmsSendConfig;
  private listeners: Map<string, Function[]> = new Map();

  constructor(config: SmsSendConfig) {
    this.config = config;
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

  async send(to: string, body: string): Promise<SmsSendResult> {
    try {
      switch (this.config.provider) {
        case "twilio":
          return await this.sendTwilio(to, body);
        case "vonage":
          return await this.sendVonage(to, body);
        default:
          throw new Error(`Unknown provider: ${this.config.provider}`);
      }
    } catch (err: any) {
      this.emit("onError", { code: "SEND_FAILED", message: err.message, to });
      throw err;
    }
  }

  async sendBatch(messages: Array<{ to: string; body: string }>): Promise<SmsSendResult[]> {
    const results: SmsSendResult[] = [];
    for (const msg of messages) {
      results.push(await this.send(msg.to, msg.body));
    }
    return results;
  }

  // ─── Twilio ──────────────────────────────────────────────

  private async sendTwilio(to: string, body: string): Promise<SmsSendResult> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.config.accountSid}/Messages.json`;
    const auth = Buffer.from(`${this.config.accountSid}:${this.config.authToken}`).toString("base64");

    const params = new URLSearchParams({
      To: to,
      From: this.config.fromNumber,
      Body: body,
    });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message ?? `Twilio API error: ${res.status}`);
    }

    const data = await res.json();
    const result: SmsSendResult = {
      messageSid: data.sid,
      to,
      status: data.status,
      provider: "twilio",
    };
    this.emit("onSent", { to, messageSid: data.sid });
    return result;
  }

  // ─── Vonage ──────────────────────────────────────────────

  private async sendVonage(to: string, body: string): Promise<SmsSendResult> {
    const res = await fetch("https://rest.nexmo.com/sms/json", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: this.config.accountSid,
        api_secret: this.config.authToken,
        from: this.config.fromNumber,
        to: to.replace(/\+/g, ""),
        text: body,
      }),
    });

    if (!res.ok) {
      throw new Error(`Vonage API error: ${res.status}`);
    }

    const data = await res.json();
    const msg = data.messages?.[0];
    if (msg?.status !== "0") {
      throw new Error(msg?.["error-text"] ?? "Vonage send failed");
    }

    const result: SmsSendResult = {
      messageSid: msg["message-id"],
      to,
      status: "sent",
      provider: "vonage",
    };
    this.emit("onSent", { to, messageSid: msg["message-id"] });
    return result;
  }
}
