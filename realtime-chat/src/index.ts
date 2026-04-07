// @radzor/realtime-chat — WebSocket-based real-time messaging

export interface ChatConfig {
  roomId: string;
  userId: string;
  serverUrl: string;
  maxMessages?: number;
  authToken?: string;
}

export interface ChatMessage {
  id: string;
  userId: string;
  content: string;
  timestamp: number;
}

export type EventMap = {
  onMessage: ChatMessage;
  onUserJoin: { userId: string; username: string };
  onUserLeave: { userId: string };
  onTyping: { userId: string; isTyping: boolean };
  onError: { code: string; message: string };
};

export type Listener<T> = (event: T) => void;
export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export class RealtimeChat {
  private config: Required<Omit<ChatConfig, "authToken">> & { authToken?: string };
  private ws: WebSocket | null = null;
  private messages: ChatMessage[] = [];
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _status: ConnectionStatus = "disconnected";
  private typingTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: ChatConfig) {
    this.config = {
      maxMessages: config.maxMessages ?? 100,
      ...config,
    };
  }

  get connectionStatus(): ConnectionStatus {
    return this._status;
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

  /** Join a chat room and start receiving messages. */
  async joinRoom(roomId?: string): Promise<void> {
    if (roomId) this.config.roomId = roomId;

    return new Promise((resolve, reject) => {
      this._status = "connecting";

      const url = new URL(this.config.serverUrl);
      url.searchParams.set("roomId", this.config.roomId);
      url.searchParams.set("userId", this.config.userId);
      if (this.config.authToken) {
        url.searchParams.set("token", this.config.authToken);
      }

      this.ws = new WebSocket(url.toString());

      this.ws.onopen = () => {
        this._status = "connected";
        this.reconnectAttempts = 0;

        this.send({
          type: "join",
          roomId: this.config.roomId,
          userId: this.config.userId,
        });

        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);
          this.handleServerMessage(data);
        } catch (err) {
          this.emit("onError", {
            code: "MALFORMED_MESSAGE",
            message: err instanceof Error ? err.message : "Failed to parse server message",
          });
        }
      };

      this.ws.onclose = () => {
        this._status = "disconnected";
        this.attemptReconnect();
      };

      this.ws.onerror = () => {
        this._status = "error";
        this.emit("onError", { code: "CONNECTION_ERROR", message: "WebSocket connection failed" });
        reject(new Error("WebSocket connection failed"));
      };
    });
  }

  /** Leave the current room and disconnect. */
  async leaveRoom(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({
        type: "leave",
        roomId: this.config.roomId,
        userId: this.config.userId,
      });
      this.ws.close();
    }

    this.ws = null;
    this._status = "disconnected";
  }

  /** Send a text message to the current room. */
  async sendMessage(content: string): Promise<ChatMessage> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to a room");
    }

    const message: ChatMessage = {
      id: this.generateId(),
      userId: this.config.userId,
      content,
      timestamp: Date.now(),
    };

    this.send({
      type: "message",
      roomId: this.config.roomId,
      ...message,
    });

    this.addMessage(message);
    return message;
  }

  /** Retrieve local message history buffer. */
  async getHistory(limit?: number): Promise<ChatMessage[]> {
    const count = limit ?? 50;
    return this.messages.slice(-count);
  }

  /** Broadcast typing indicator. */
  setTyping(isTyping: boolean): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    this.send({
      type: "typing",
      roomId: this.config.roomId,
      userId: this.config.userId,
      isTyping,
    });

    // Auto-clear typing after 3 seconds
    if (isTyping) {
      if (this.typingTimer) clearTimeout(this.typingTimer);
      this.typingTimer = setTimeout(() => this.setTyping(false), 3000);
    }
  }

  private handleServerMessage(data: Record<string, unknown>): void {
    switch (data.type) {
      case "message": {
        const msg: ChatMessage = {
          id: String(data.id),
          userId: String(data.userId),
          content: String(data.content),
          timestamp: Number(data.timestamp),
        };
        this.addMessage(msg);
        this.emit("onMessage", msg);
        break;
      }

      case "user_join":
        this.emit("onUserJoin", {
          userId: String(data.userId),
          username: String(data.username ?? data.userId),
        });
        break;

      case "user_leave":
        this.emit("onUserLeave", { userId: String(data.userId) });
        break;

      case "typing":
        this.emit("onTyping", {
          userId: String(data.userId),
          isTyping: Boolean(data.isTyping),
        });
        break;

      case "error":
        this.emit("onError", {
          code: String(data.code ?? "SERVER_ERROR"),
          message: String(data.message ?? "Unknown error"),
        });
        break;

      case "history": {
        const messages = (data.messages as Record<string, unknown>[]) ?? [];
        for (const m of messages) {
          const msg: ChatMessage = {
            id: String(m.id),
            userId: String(m.userId),
            content: String(m.content),
            timestamp: Number(m.timestamp),
          };
          this.addMessage(msg);
        }
        break;
      }
    }
  }

  private addMessage(msg: ChatMessage): void {
    this.messages.push(msg);
    if (this.messages.length > this.config.maxMessages) {
      this.messages = this.messages.slice(-this.config.maxMessages);
    }
  }

  private send(data: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.emit("onError", {
        code: "MAX_RECONNECT",
        message: "Maximum reconnection attempts reached",
      });
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      this.joinRoom().catch(() => {
        // Reconnect failed, will retry via onclose handler
      });
    }, delay);
  }

  private generateId(): string {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
}

export default RealtimeChat;
