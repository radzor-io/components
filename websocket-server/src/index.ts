// @radzor/websocket-server — WebSocket server with rooms and broadcasting

import { WebSocketServer, WebSocket } from "ws";
import * as crypto from "crypto";
import type { IncomingMessage } from "http";

// ---- types ----

export interface WsServerConfig {
  port: number;
  path?: string;
  maxPayloadSize?: number;
  heartbeatInterval?: number;
}

export interface ClientInfo {
  id: string;
  socket: WebSocket;
  remoteAddress: string;
  rooms: Set<string>;
  alive: boolean;
}

export interface ServerInfo {
  port: number;
  clientCount: number;
  roomCount: number;
}

export type EventMap = {
  onConnection: { clientId: string; remoteAddress: string };
  onMessage: { clientId: string; data: string; isBinary: boolean };
  onDisconnect: { clientId: string; code: number; reason: string };
};

type Listener<T> = (payload: T) => void;

// ---- implementation ----

export class WsServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, ClientInfo> = new Map();
  private rooms: Map<string, Set<string>> = new Map();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private config: WsServerConfig;
  private listeners: { [K in keyof EventMap]?: Array<Listener<EventMap[K]>> } = {};

  constructor(config: WsServerConfig) {
    this.config = config;
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

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.wss = new WebSocketServer({
          port: this.config.port,
          path: this.config.path ?? "/",
          maxPayload: this.config.maxPayloadSize ?? 1048576,
        });

        this.wss.on("listening", () => {
          this.setupHeartbeat();
          resolve();
        });

        this.wss.on("error", (err) => {
          reject(err);
        });

        this.wss.on("connection", (socket: WebSocket, req: IncomingMessage) => {
          this.handleConnection(socket, req);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.heartbeatTimer) {
        clearInterval(this.heartbeatTimer);
        this.heartbeatTimer = null;
      }

      // Close all client connections
      for (const client of this.clients.values()) {
        client.socket.close(1001, "Server shutting down");
      }
      this.clients.clear();
      this.rooms.clear();

      if (this.wss) {
        this.wss.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private handleConnection(socket: WebSocket, req: IncomingMessage): void {
    const clientId = crypto.randomUUID();
    const remoteAddress =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
      req.socket.remoteAddress ??
      "unknown";

    const clientInfo: ClientInfo = {
      id: clientId,
      socket,
      remoteAddress,
      rooms: new Set(),
      alive: true,
    };

    this.clients.set(clientId, clientInfo);
    this.emit("onConnection", { clientId, remoteAddress });

    socket.on("message", (raw, isBinary) => {
      const data = isBinary ? raw.toString("hex") : raw.toString("utf-8");
      this.emit("onMessage", { clientId, data, isBinary });
    });

    socket.on("close", (code, reason) => {
      this.handleDisconnect(clientId, code, reason.toString("utf-8"));
    });

    socket.on("pong", () => {
      clientInfo.alive = true;
    });

    socket.on("error", () => {
      this.handleDisconnect(clientId, 1006, "Connection error");
    });
  }

  private handleDisconnect(clientId: string, code: number, reason: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    // Remove from all rooms
    for (const room of client.rooms) {
      const roomClients = this.rooms.get(room);
      if (roomClients) {
        roomClients.delete(clientId);
        if (roomClients.size === 0) this.rooms.delete(room);
      }
    }

    this.clients.delete(clientId);
    this.emit("onDisconnect", { clientId, code, reason });
  }

  private setupHeartbeat(): void {
    const interval = this.config.heartbeatInterval ?? 30000;
    if (interval <= 0) return;

    this.heartbeatTimer = setInterval(() => {
      for (const [clientId, client] of this.clients) {
        if (!client.alive) {
          client.socket.terminate();
          this.handleDisconnect(clientId, 1001, "Heartbeat timeout");
          continue;
        }
        client.alive = false;
        client.socket.ping();
      }
    }, interval);
  }

  broadcast(data: string, room?: string, excludeClientId?: string): number {
    let count = 0;
    const targetIds = room ? this.rooms.get(room) : undefined;

    if (room && !targetIds) return 0;

    const iterate = targetIds
      ? [...targetIds].map((id) => this.clients.get(id)).filter(Boolean) as ClientInfo[]
      : [...this.clients.values()];

    for (const client of iterate) {
      if (client.id === excludeClientId) continue;
      if (client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(data);
        count++;
      }
    }

    return count;
  }

  sendToClient(clientId: string, data: string): boolean {
    const client = this.clients.get(clientId);
    if (!client || client.socket.readyState !== WebSocket.OPEN) return false;
    client.socket.send(data);
    return true;
  }

  joinRoom(clientId: string, room: string): void {
    const client = this.clients.get(clientId);
    if (!client) throw new Error(`Client ${clientId} not found`);

    client.rooms.add(room);

    if (!this.rooms.has(room)) {
      this.rooms.set(room, new Set());
    }
    this.rooms.get(room)!.add(clientId);
  }

  leaveRoom(clientId: string, room: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.rooms.delete(room);
    const roomClients = this.rooms.get(room);
    if (roomClients) {
      roomClients.delete(clientId);
      if (roomClients.size === 0) this.rooms.delete(room);
    }
  }

  closeConnection(clientId: string, code?: number, reason?: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;
    client.socket.close(code ?? 1000, reason ?? "");
  }

  getInfo(): ServerInfo {
    return {
      port: this.config.port,
      clientCount: this.clients.size,
      roomCount: this.rooms.size,
    };
  }

  getClients(): Array<{ id: string; remoteAddress: string; rooms: string[] }> {
    return [...this.clients.values()].map((c) => ({
      id: c.id,
      remoteAddress: c.remoteAddress,
      rooms: [...c.rooms],
    }));
  }

  getRoomMembers(room: string): string[] {
    return [...(this.rooms.get(room) ?? [])];
  }
}

export default WsServer;
