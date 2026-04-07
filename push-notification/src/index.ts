// @radzor/push-notification — Push notifications via FCM / APNs

// ---- types ----

export interface PushNotificationConfig {
  provider: "fcm" | "apns";
  credentials: FcmCredentials | ApnsCredentials;
}

export interface FcmCredentials {
  serverKey: string;
}

export interface ApnsCredentials {
  keyId: string;
  teamId: string;
  privateKey: string;
  bundleId: string;
  production?: boolean;
}

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  badge?: number;
  sound?: string;
}

export interface PushResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export type EventMap = {
  onSent: PushResult;
  onError: { code: string; message: string };
};

// ---- implementation ----

export class PushNotification {
  private config: PushNotificationConfig;
  private listeners: { [K in keyof EventMap]?: Array<(payload: EventMap[K]) => void> } = {};

  constructor(config: PushNotificationConfig) {
    this.config = config;
  }

  on<K extends keyof EventMap>(event: K, listener: (payload: EventMap[K]) => void): void {
    (this.listeners[event] ??= []).push(listener);
  }

  off<K extends keyof EventMap>(event: K, listener: (payload: EventMap[K]) => void): void {
    const arr = this.listeners[event];
    if (arr) this.listeners[event] = arr.filter((l) => l !== listener) as any;
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    this.listeners[event]?.forEach((l) => l(payload));
  }

  async sendToDevice(deviceToken: string, payload: PushPayload): Promise<PushResult> {
    if (this.config.provider === "fcm") {
      return this.sendFcm(deviceToken, payload);
    }
    return this.sendApns(deviceToken, payload);
  }

  async sendToTopic(topic: string, payload: PushPayload): Promise<PushResult> {
    if (this.config.provider !== "fcm") {
      throw new Error("sendToTopic is only supported with FCM");
    }
    return this.sendFcm(`/topics/${topic}`, payload);
  }

  private async sendFcm(to: string, payload: PushPayload): Promise<PushResult> {
    const creds = this.config.credentials as FcmCredentials;
    try {
      const res = await fetch("https://fcm.googleapis.com/fcm/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `key=${creds.serverKey}`,
        },
        body: JSON.stringify({
          to,
          notification: { title: payload.title, body: payload.body, sound: payload.sound || "default" },
          data: payload.data,
        }),
      });

      const json = await res.json();
      const result: PushResult = {
        success: json.success === 1,
        messageId: json.results?.[0]?.message_id,
        error: json.results?.[0]?.error,
      };
      this.emit("onSent", result);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "FCM_ERROR", message });
      throw err;
    }
  }

  private async sendApns(deviceToken: string, payload: PushPayload): Promise<PushResult> {
    const creds = this.config.credentials as ApnsCredentials;
    const host = creds.production ? "api.push.apple.com" : "api.sandbox.push.apple.com";

    try {
      const apnsPayload = {
        aps: {
          alert: { title: payload.title, body: payload.body },
          badge: payload.badge,
          sound: payload.sound || "default",
        },
        ...payload.data,
      };

      const res = await fetch(`https://${host}/3/device/${deviceToken}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apns-topic": creds.bundleId,
          "apns-push-type": "alert",
        },
        body: JSON.stringify(apnsPayload),
      });

      const result: PushResult = {
        success: res.status === 200,
        messageId: res.headers.get("apns-id") || undefined,
      };

      if (!result.success) {
        const body = await res.json();
        result.error = body.reason;
      }

      this.emit("onSent", result);
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "APNS_ERROR", message });
      throw err;
    }
  }
}
