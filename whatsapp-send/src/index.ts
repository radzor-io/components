// @radzor/whatsapp-send — Send WhatsApp messages via Meta Cloud API

// ---- types ----

export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  apiVersion?: string;
}

export interface SendResult {
  messageId: string;
  recipientPhone: string;
}

export interface TemplateComponent {
  type: "header" | "body" | "button";
  parameters: Array<{
    type: "text" | "image" | "document" | "video";
    text?: string;
    image?: { link: string };
    document?: { link: string; filename: string };
    video?: { link: string };
  }>;
  sub_type?: string;
  index?: number;
}

export type EventMap = {
  onMessageDelivered: { messageId: string; recipientPhone: string; timestamp: string };
  onMessageRead: { messageId: string; recipientPhone: string; timestamp: string };
};

type Listener<T> = (payload: T) => void;

// ---- implementation ----

const GRAPH_API = "https://graph.facebook.com";

export class WhatsAppSend {
  private accessToken: string;
  private phoneNumberId: string;
  private apiVersion: string;
  private baseUrl: string;
  private listeners: { [K in keyof EventMap]?: Array<Listener<EventMap[K]>> } = {};

  constructor(config: WhatsAppConfig) {
    this.accessToken = config.accessToken;
    this.phoneNumberId = config.phoneNumberId;
    this.apiVersion = config.apiVersion ?? "v18.0";
    this.baseUrl = `${GRAPH_API}/${this.apiVersion}/${this.phoneNumberId}`;
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

  private async request(
    endpoint: string,
    body: Record<string, unknown>
  ): Promise<any> {
    const url = `${this.baseUrl}/${endpoint}`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!res.ok) {
      const errMsg =
        data?.error?.message ?? `WhatsApp API error: ${res.status}`;
      throw new Error(errMsg);
    }

    return data;
  }

  async sendText(
    to: string,
    body: string,
    previewUrl?: boolean
  ): Promise<SendResult> {
    const payload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: {
        preview_url: previewUrl ?? false,
        body,
      },
    };

    const data = await this.request("messages", payload);
    const messageId = data.messages?.[0]?.id ?? "";

    return { messageId, recipientPhone: to };
  }

  async sendTemplate(
    to: string,
    templateName: string,
    languageCode: string,
    components?: TemplateComponent[]
  ): Promise<SendResult> {
    const template: Record<string, unknown> = {
      name: templateName,
      language: { code: languageCode },
    };

    if (components && components.length > 0) {
      template.components = components;
    }

    const payload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template,
    };

    const data = await this.request("messages", payload);
    const messageId = data.messages?.[0]?.id ?? "";

    return { messageId, recipientPhone: to };
  }

  async sendMedia(
    to: string,
    mediaType: "image" | "video" | "audio" | "document",
    mediaUrl?: string,
    mediaId?: string,
    caption?: string
  ): Promise<SendResult> {
    if (!mediaUrl && !mediaId) {
      throw new Error("Either mediaUrl or mediaId is required");
    }

    const mediaObj: Record<string, unknown> = {};
    if (mediaId) {
      mediaObj.id = mediaId;
    } else {
      mediaObj.link = mediaUrl;
    }
    if (caption && mediaType !== "audio") {
      mediaObj.caption = caption;
    }

    const payload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: mediaType,
      [mediaType]: mediaObj,
    };

    const data = await this.request("messages", payload);
    const messageId = data.messages?.[0]?.id ?? "";

    return { messageId, recipientPhone: to };
  }

  async markAsRead(messageId: string): Promise<boolean> {
    const payload = {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    };

    try {
      const data = await this.request("messages", payload);
      return data.success === true;
    } catch {
      return false;
    }
  }

  /**
   * Process an incoming webhook payload from Meta.
   * Call this from your webhook handler to trigger onMessageDelivered / onMessageRead events.
   */
  processWebhook(body: Record<string, any>): void {
    const entries = body.entry ?? [];
    for (const entry of entries) {
      const changes = entry.changes ?? [];
      for (const change of changes) {
        const statuses = change.value?.statuses ?? [];
        for (const status of statuses) {
          const payload = {
            messageId: status.id ?? "",
            recipientPhone: status.recipient_id ?? "",
            timestamp: status.timestamp ?? "",
          };

          if (status.status === "delivered") {
            this.emit("onMessageDelivered", payload);
          } else if (status.status === "read") {
            this.emit("onMessageRead", payload);
          }
        }
      }
    }
  }
}

export default WhatsAppSend;
