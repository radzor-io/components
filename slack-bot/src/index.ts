// @radzor/slack-bot — Slack bot with Web API and Webhooks

import * as crypto from "crypto";

interface SlackBotConfig {
  botToken?: string;
  webhookUrl?: string;
  signingSecret?: string;
}

interface MessageResult {
  ts: string;
  channel: string;
  ok: boolean;
}

interface FileResult {
  fileId: string;
  permalink: string;
}

interface SlackBlock {
  type: string;
  [key: string]: unknown;
}

interface SendOptions {
  threadTs?: string;
  unfurlLinks?: boolean;
}

type EventMap = {
  onMessageSent: MessageResult;
  onError: { code: string; message: string };
};

const SLACK_API = "https://slack.com/api";

export class SlackBot {
  private config: SlackBotConfig;
  private listeners: Map<string, Function[]> = new Map();

  constructor(config: SlackBotConfig) {
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

  private async _api(method: string, payload: Record<string, unknown>): Promise<any> {
    if (!this.config.botToken) {
      const err = { code: "NO_TOKEN", message: "botToken is required for API methods" };
      this.emit("onError", err);
      throw new Error(err.message);
    }

    let res: Response;
    try {
      res = await fetch(`${SLACK_API}/${method}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.botToken}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(payload),
      });
    } catch (fetchErr: any) {
      const err = { code: "NETWORK_ERROR", message: fetchErr.message };
      this.emit("onError", err);
      throw new Error(err.message);
    }

    const data = await res.json();

    if (!data.ok) {
      const err = { code: data.error ?? "SLACK_ERROR", message: data.error ?? "Slack API error" };
      this.emit("onError", err);
      throw new Error(err.message);
    }

    return data;
  }

  async webhookSend(text: string): Promise<void> {
    if (!this.config.webhookUrl) {
      throw new Error("webhookUrl is required for webhookSend");
    }
    const res = await fetch(this.config.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const err = { code: "WEBHOOK_ERROR", message: `Webhook responded with ${res.status}` };
      this.emit("onError", err);
      throw new Error(err.message);
    }
  }

  async sendMessage(
    channel: string,
    text: string,
    options?: SendOptions
  ): Promise<{ ts: string; channel: string }> {
    const payload: Record<string, unknown> = { channel, text };
    if (options?.threadTs) payload.thread_ts = options.threadTs;
    if (options?.unfurlLinks !== undefined) payload.unfurl_links = options.unfurlLinks;

    const data = await this._api("chat.postMessage", payload);
    const result: MessageResult = { ts: data.ts, channel: data.channel, ok: true };
    this.emit("onMessageSent", result);
    return { ts: data.ts, channel: data.channel };
  }

  async sendBlocks(
    channel: string,
    blocks: SlackBlock[],
    text?: string
  ): Promise<{ ts: string; channel: string }> {
    const payload: Record<string, unknown> = {
      channel,
      blocks,
      text: text ?? "",
    };

    const data = await this._api("chat.postMessage", payload);
    const result: MessageResult = { ts: data.ts, channel: data.channel, ok: true };
    this.emit("onMessageSent", result);
    return { ts: data.ts, channel: data.channel };
  }

  async reply(
    channel: string,
    threadTs: string,
    text: string
  ): Promise<{ ts: string; channel: string }> {
    return this.sendMessage(channel, text, { threadTs });
  }

  async uploadFile(
    channel: string,
    content: Buffer | string,
    filename: string,
    title?: string
  ): Promise<FileResult> {
    const contentBuffer = typeof content === "string" ? Buffer.from(content, "utf-8") : content;
    const length = contentBuffer.length;

    // Step 1: Get upload URL (Files API v2)
    const urlData = await this._api("files.getUploadURLExternal", {
      filename,
      length,
    });

    const uploadUrl: string = urlData.upload_url;
    const fileId: string = urlData.file_id;

    // Step 2: Upload file content to the provided URL
    const uploadRes = await fetch(uploadUrl, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: contentBuffer,
    });

    if (!uploadRes.ok) {
      const err = { code: "UPLOAD_ERROR", message: `Upload failed with status ${uploadRes.status}` };
      this.emit("onError", err);
      throw new Error(err.message);
    }

    // Step 3: Complete the upload and share to channel
    const completeData = await this._api("files.completeUploadExternal", {
      files: [{ id: fileId, title: title ?? filename }],
      channel_id: channel,
    });

    const file = completeData.files?.[0] ?? {};
    return {
      fileId: file.id ?? fileId,
      permalink: file.permalink ?? "",
    };
  }

  verifyRequest(body: string, timestamp: string, signature: string): boolean {
    if (!this.config.signingSecret) {
      throw new Error("signingSecret is required for verifyRequest");
    }

    const baseString = `v0:${timestamp}:${body}`;
    const hmac = crypto
      .createHmac("sha256", this.config.signingSecret)
      .update(baseString)
      .digest("hex");

    const expected = `v0=${hmac}`;

    // Timing-safe comparison
    if (expected.length !== signature.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }
}
