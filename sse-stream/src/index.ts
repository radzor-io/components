// @radzor/sse-stream — Server-Sent Events streaming with named streams and client management

import type { IncomingMessage, ServerResponse } from "http";
import * as crypto from "crypto";

// ---- types ----

export interface SseStreamConfig {
  retryMs?: number;
  keepAliveInterval?: number;
  maxClients?: number;
}

export interface SseClient {
  id: string;
  res: ServerResponse;
  lastEventId: string;
}

export interface StreamState {
  clients: Map<string, SseClient>;
  eventCounter: number;
  keepAliveTimer: ReturnType<typeof setInterval> | null;
}

export interface StreamInfo {
  streamId: string;
  clientCount: number;
  totalEventsSent: number;
}

export type EventMap = {
  onClientConnected: { streamId: string; clientId: string; lastEventId: string };
  onClientDisconnected: { streamId: string; clientId: string };
};

type Listener<T> = (payload: T) => void;

// ---- implementation ----

export class SseStream {
  private streams: Map<string, StreamState> = new Map();
  private retryMs: number;
  private keepAliveInterval: number;
  private maxClients: number;
  private listeners: { [K in keyof EventMap]?: Array<Listener<EventMap[K]>> } = {};

  constructor(config: SseStreamConfig = {}) {
    this.retryMs = config.retryMs ?? 3000;
    this.keepAliveInterval = config.keepAliveInterval ?? 15000;
    this.maxClients = config.maxClients ?? 1000;
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

  createStream(
    streamId: string
  ): { streamId: string; handler: (req: IncomingMessage, res: ServerResponse) => void } {
    if (this.streams.has(streamId)) {
      throw new Error(`Stream "${streamId}" already exists`);
    }

    const state: StreamState = {
      clients: new Map(),
      eventCounter: 0,
      keepAliveTimer: null,
    };

    this.streams.set(streamId, state);

    // Start keep-alive
    if (this.keepAliveInterval > 0) {
      state.keepAliveTimer = setInterval(() => {
        this.sendKeepAlive(streamId);
      }, this.keepAliveInterval);
    }

    const handler = (req: IncomingMessage, res: ServerResponse): void => {
      this.handleConnection(streamId, req, res);
    };

    return { streamId, handler };
  }

  private handleConnection(
    streamId: string,
    req: IncomingMessage,
    res: ServerResponse
  ): void {
    const state = this.streams.get(streamId);
    if (!state) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Stream not found");
      return;
    }

    if (state.clients.size >= this.maxClients) {
      res.writeHead(503, { "Content-Type": "text/plain" });
      res.end("Too many clients");
      return;
    }

    const clientId = crypto.randomUUID();
    const lastEventId = req.headers["last-event-id"] as string ?? "";

    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
      "X-Accel-Buffering": "no", // Disable nginx buffering
    });

    // Send retry interval
    res.write(`retry: ${this.retryMs}\n\n`);

    const client: SseClient = { id: clientId, res, lastEventId };
    state.clients.set(clientId, client);

    this.emit("onClientConnected", { streamId, clientId, lastEventId });

    // Handle client disconnect
    req.on("close", () => {
      state.clients.delete(clientId);
      this.emit("onClientDisconnected", { streamId, clientId });
    });

    req.on("error", () => {
      state.clients.delete(clientId);
    });
  }

  pushEvent(
    streamId: string,
    data: string | object,
    eventType?: string,
    id?: string
  ): number {
    const state = this.streams.get(streamId);
    if (!state) throw new Error(`Stream "${streamId}" not found`);

    state.eventCounter++;

    const serialized = typeof data === "object" ? JSON.stringify(data) : data;
    const eventId = id ?? String(state.eventCounter);

    // Build SSE frame
    let frame = "";
    if (eventType && eventType !== "message") {
      frame += `event: ${eventType}\n`;
    }
    frame += `id: ${eventId}\n`;

    // Handle multiline data
    for (const line of serialized.split("\n")) {
      frame += `data: ${line}\n`;
    }
    frame += "\n";

    let sentCount = 0;
    const deadClients: string[] = [];

    for (const [cid, client] of state.clients) {
      try {
        if (!client.res.writableEnded) {
          client.res.write(frame);
          sentCount++;
        } else {
          deadClients.push(cid);
        }
      } catch {
        deadClients.push(cid);
      }
    }

    // Clean up dead clients
    for (const cid of deadClients) {
      state.clients.delete(cid);
      this.emit("onClientDisconnected", { streamId, clientId: cid });
    }

    return sentCount;
  }

  closeStream(streamId: string): void {
    const state = this.streams.get(streamId);
    if (!state) return;

    // Stop keep-alive
    if (state.keepAliveTimer) {
      clearInterval(state.keepAliveTimer);
    }

    // Close all client connections
    for (const [cid, client] of state.clients) {
      try {
        if (!client.res.writableEnded) {
          client.res.end();
        }
      } catch {
        // ignore
      }
      this.emit("onClientDisconnected", { streamId, clientId: cid });
    }

    this.streams.delete(streamId);
  }

  getStreamInfo(streamId: string): StreamInfo | null {
    const state = this.streams.get(streamId);
    if (!state) return null;

    return {
      streamId,
      clientCount: state.clients.size,
      totalEventsSent: state.eventCounter,
    };
  }

  getActiveStreams(): string[] {
    return [...this.streams.keys()];
  }

  private sendKeepAlive(streamId: string): void {
    const state = this.streams.get(streamId);
    if (!state) return;

    const comment = `: keep-alive ${Date.now()}\n\n`;
    const deadClients: string[] = [];

    for (const [cid, client] of state.clients) {
      try {
        if (!client.res.writableEnded) {
          client.res.write(comment);
        } else {
          deadClients.push(cid);
        }
      } catch {
        deadClients.push(cid);
      }
    }

    for (const cid of deadClients) {
      state.clients.delete(cid);
      this.emit("onClientDisconnected", { streamId, clientId: cid });
    }
  }
}

export default SseStream;
