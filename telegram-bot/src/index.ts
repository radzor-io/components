// @radzor/telegram-bot — Telegram Bot API

const API_BASE = "https://api.telegram.org";

// ---- types ----

export interface TelegramBotConfig {
  botToken: string;
}

export interface TelegramMessage {
  messageId: number;
  chatId: number;
  text?: string;
  date: number;
}

export interface InlineKeyboardButton {
  text: string;
  url?: string;
  callbackData?: string;
}

export interface ReplyKeyboardButton {
  text: string;
  requestContact?: boolean;
  requestLocation?: boolean;
}

export type EventMap = {
  onMessageSent: TelegramMessage;
  onError: { code: string; message: string };
};

// ---- implementation ----

export class TelegramBot {
  private token: string;
  private listeners: { [K in keyof EventMap]?: Array<(payload: EventMap[K]) => void> } = {};

  constructor(config: TelegramBotConfig) {
    this.token = config.botToken;
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

  async sendMessage(chatId: number | string, text: string, parseMode?: "HTML" | "Markdown" | "MarkdownV2"): Promise<TelegramMessage> {
    const body: Record<string, unknown> = { chat_id: chatId, text };
    if (parseMode) body.parse_mode = parseMode;
    return this.apiCall("sendMessage", body);
  }

  async sendPhoto(chatId: number | string, photoUrl: string, caption?: string): Promise<TelegramMessage> {
    const body: Record<string, unknown> = { chat_id: chatId, photo: photoUrl };
    if (caption) body.caption = caption;
    return this.apiCall("sendPhoto", body);
  }

  async sendReplyKeyboard(chatId: number | string, text: string, keyboard: ReplyKeyboardButton[][]): Promise<TelegramMessage> {
    return this.apiCall("sendMessage", {
      chat_id: chatId,
      text,
      reply_markup: { keyboard, resize_keyboard: true, one_time_keyboard: true },
    });
  }

  async sendInlineKeyboard(chatId: number | string, text: string, buttons: InlineKeyboardButton[][]): Promise<TelegramMessage> {
    const inlineKeyboard = buttons.map((row) =>
      row.map((b) => ({
        text: b.text,
        ...(b.url ? { url: b.url } : {}),
        ...(b.callbackData ? { callback_data: b.callbackData } : {}),
      }))
    );
    return this.apiCall("sendMessage", {
      chat_id: chatId,
      text,
      reply_markup: { inline_keyboard: inlineKeyboard },
    });
  }

  private async apiCall(method: string, body: Record<string, unknown>): Promise<TelegramMessage> {
    try {
      const res = await fetch(`${API_BASE}/bot${this.token}/${method}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!json.ok) {
        throw new Error(json.description || `Telegram API error: ${res.status}`);
      }

      const r = json.result;
      const msg: TelegramMessage = {
        messageId: r.message_id,
        chatId: r.chat.id,
        text: r.text,
        date: r.date,
      };
      this.emit("onMessageSent", msg);
      return msg;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "API_ERROR", message });
      throw err;
    }
  }
}
