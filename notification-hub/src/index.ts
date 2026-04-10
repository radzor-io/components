// @radzor/notification-hub — Fan-out notifications to multiple channels

// ---- types ----

export interface NotificationHubConfig {
  defaultChannels?: string[];
  retryAttempts?: number;
}

export type ChannelType = "email" | "sms" | "push" | "slack" | "webhook";

export interface ChannelConfig {
  type: ChannelType;
  config: Record<string, string>;
}

export interface DeliveryResult {
  channel: string;
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface SendOptions {
  title: string;
  body: string;
  recipient: string;
  channels?: string[];
  metadata?: Record<string, string>;
}

export type EventMap = {
  onDelivered: { channelName: string; messageId: string; recipient: string };
  onFailed: { channelName: string; error: string; recipient: string; attempts: number };
};

type Listener<T> = (payload: T) => void;

// ---- channel transports ----

async function sendEmail(
  cfg: Record<string, string>,
  title: string,
  body: string,
  recipient: string
): Promise<string> {
  // SendGrid API
  if (cfg.sendgridApiKey) {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.sendgridApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: recipient }] }],
        from: { email: cfg.fromEmail ?? "noreply@example.com" },
        subject: title,
        content: [{ type: "text/plain", value: body }],
      }),
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`SendGrid error ${res.status}: ${errBody}`);
    }
    return `sg-${Date.now()}`;
  }

  // SMTP via a lightweight HTTP-to-SMTP bridge (e.g. Mailhog API, or custom)
  // For raw SMTP, Node's net module would be needed
  if (cfg.smtpHost) {
    const payload = {
      host: cfg.smtpHost,
      port: cfg.smtpPort ?? "587",
      auth: { user: cfg.smtpUser ?? "", pass: cfg.smtpPass ?? "" },
      from: cfg.fromEmail ?? "noreply@example.com",
      to: recipient,
      subject: title,
      text: body,
    };
    // Attempt delivery via Nodemailer-compatible HTTP API if available
    const apiUrl = cfg.smtpApiUrl;
    if (apiUrl) {
      const res = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`SMTP API error: ${res.status}`);
      const data: any = await res.json();
      return data.messageId ?? `smtp-${Date.now()}`;
    }
    throw new Error("smtpApiUrl is required for SMTP transport in this runtime");
  }

  throw new Error("Email channel requires sendgridApiKey or smtpHost+smtpApiUrl");
}

async function sendSms(
  cfg: Record<string, string>,
  _title: string,
  body: string,
  recipient: string
): Promise<string> {
  // Twilio
  const accountSid = cfg.twilioAccountSid;
  const authToken = cfg.twilioAuthToken;
  const from = cfg.twilioFrom;

  if (!accountSid || !authToken || !from) {
    throw new Error("SMS channel requires twilioAccountSid, twilioAuthToken, twilioFrom");
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const params = new URLSearchParams({ To: recipient, From: from, Body: body });
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const data: any = await res.json();
  if (data.error_code) throw new Error(`Twilio error: ${data.message}`);
  return data.sid ?? `twilio-${Date.now()}`;
}

async function sendPush(
  cfg: Record<string, string>,
  title: string,
  body: string,
  recipient: string
): Promise<string> {
  // Firebase Cloud Messaging (legacy HTTP API)
  const serverKey = cfg.fcmServerKey;
  if (!serverKey) throw new Error("Push channel requires fcmServerKey");

  const res = await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: {
      Authorization: `key=${serverKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: recipient, // device token or topic
      notification: { title, body },
    }),
  });

  const data: any = await res.json();
  if (data.failure > 0) {
    throw new Error(`FCM delivery failed: ${JSON.stringify(data.results)}`);
  }
  return data.message_id?.toString() ?? `fcm-${Date.now()}`;
}

async function sendSlack(
  cfg: Record<string, string>,
  title: string,
  body: string,
  _recipient: string
): Promise<string> {
  const webhookUrl = cfg.webhookUrl;
  if (!webhookUrl) throw new Error("Slack channel requires webhookUrl");

  const text = title ? `*${title}*\n${body}` : body;
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) throw new Error(`Slack webhook error: ${res.status}`);
  return `slack-${Date.now()}`;
}

async function sendWebhook(
  cfg: Record<string, string>,
  title: string,
  body: string,
  recipient: string
): Promise<string> {
  const url = cfg.url;
  if (!url) throw new Error("Webhook channel requires url");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cfg.authHeader) headers.Authorization = cfg.authHeader;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ title, body, recipient, timestamp: new Date().toISOString() }),
  });

  if (!res.ok) throw new Error(`Webhook error: ${res.status}`);
  return `wh-${Date.now()}`;
}

const TRANSPORTS: Record<
  ChannelType,
  (cfg: Record<string, string>, title: string, body: string, recipient: string) => Promise<string>
> = {
  email: sendEmail,
  sms: sendSms,
  push: sendPush,
  slack: sendSlack,
  webhook: sendWebhook,
};

// ---- implementation ----

export class NotificationHub {
  private channels: Map<string, ChannelConfig> = new Map();
  private defaultChannels: string[];
  private retryAttempts: number;
  private listeners: { [K in keyof EventMap]?: Array<Listener<EventMap[K]>> } = {};

  constructor(config: NotificationHubConfig = {}) {
    this.defaultChannels = config.defaultChannels ?? [];
    this.retryAttempts = config.retryAttempts ?? 2;
  }

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    (this.listeners[event] ??= []).push(listener);
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    const arr = this.listeners[event];
    if (arr) this.listeners[event] = arr.filter((l) => l !== listener) as any;
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    this.listeners[event]?.forEach((l) => l(payload));
  }

  registerChannel(
    name: string,
    type: ChannelType,
    config: Record<string, string>
  ): void {
    this.channels.set(name, { type, config });
  }

  removeChannel(name: string): boolean {
    return this.channels.delete(name);
  }

  async send(options: SendOptions): Promise<{ results: DeliveryResult[] }> {
    const { title, body, recipient, metadata } = options;
    const channelNames = options.channels ?? this.defaultChannels;

    if (channelNames.length === 0) {
      throw new Error("No channels specified and no defaultChannels configured");
    }

    const results: DeliveryResult[] = [];

    const tasks = channelNames.map(async (channelName) => {
      const channel = this.channels.get(channelName);
      if (!channel) {
        const result: DeliveryResult = {
          channel: channelName,
          success: false,
          error: `Channel "${channelName}" not registered`,
        };
        results.push(result);
        this.emit("onFailed", {
          channelName,
          error: result.error!,
          recipient,
          attempts: 0,
        });
        return;
      }

      const transport = TRANSPORTS[channel.type];
      if (!transport) {
        const result: DeliveryResult = {
          channel: channelName,
          success: false,
          error: `Unknown channel type: ${channel.type}`,
        };
        results.push(result);
        return;
      }

      // Merge metadata into channel config for transport use
      const mergedConfig = { ...channel.config, ...metadata };

      let lastError = "";
      for (let attempt = 0; attempt <= this.retryAttempts; attempt++) {
        try {
          const messageId = await transport(mergedConfig, title, body, recipient);
          const result: DeliveryResult = {
            channel: channelName,
            success: true,
            messageId,
          };
          results.push(result);
          this.emit("onDelivered", { channelName, messageId, recipient });
          return;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          if (attempt < this.retryAttempts) {
            await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          }
        }
      }

      const result: DeliveryResult = {
        channel: channelName,
        success: false,
        error: lastError,
      };
      results.push(result);
      this.emit("onFailed", {
        channelName,
        error: lastError,
        recipient,
        attempts: this.retryAttempts + 1,
      });
    });

    await Promise.allSettled(tasks);
    return { results };
  }
}

export default NotificationHub;
