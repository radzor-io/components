// @radzor/discord-bot — Discord bot with REST API

interface DiscordBotConfig {
  botToken: string;
  applicationId?: string;
}

interface DiscordMessage {
  id: string;
  channelId: string;
  content: string;
  authorId: string;
}

interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  footer?: { text: string };
  timestamp?: string;
}

type EventMap = {
  onMessage: { channelId: string; content: string; authorId: string };
  onError: { code: string; message: string };
};

const API = "https://discord.com/api/v10";

export class DiscordBot {
  private config: DiscordBotConfig;
  private listeners: Map<string, Function[]> = new Map();

  constructor(config: DiscordBotConfig) {
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

  async sendMessage(channelId: string, content: string): Promise<DiscordMessage> {
    return this.apiRequest("POST", `/channels/${channelId}/messages`, { content });
  }

  async sendEmbed(channelId: string, embed: DiscordEmbed): Promise<DiscordMessage> {
    return this.apiRequest("POST", `/channels/${channelId}/messages`, { embeds: [embed] });
  }

  async replyTo(channelId: string, messageId: string, content: string): Promise<DiscordMessage> {
    return this.apiRequest("POST", `/channels/${channelId}/messages`, {
      content,
      message_reference: { message_id: messageId },
    });
  }

  async deleteMessage(channelId: string, messageId: string): Promise<void> {
    await this.apiRequest("DELETE", `/channels/${channelId}/messages/${messageId}`);
  }

  private async apiRequest(method: string, path: string, body?: any): Promise<any> {
    try {
      const res = await fetch(`${API}${path}`, {
        method,
        headers: {
          Authorization: `Bot ${this.config.botToken}`,
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message ?? `Discord API error: ${res.status}`);
      }

      if (res.status === 204) return;
      const data = await res.json();
      return {
        id: data.id,
        channelId: data.channel_id,
        content: data.content ?? "",
        authorId: data.author?.id ?? "",
      };
    } catch (err: any) {
      this.emit("onError", { code: "API_ERROR", message: err.message });
      throw err;
    }
  }
}
