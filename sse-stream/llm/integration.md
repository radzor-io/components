# How to integrate @radzor/sse-stream

## Overview
Server-Sent Events (SSE) streaming server. Create named streams, push typed events to connected clients, and manage connections with automatic keep-alive and reconnection support. No external dependencies.

## Integration Steps

### TypeScript

1. **No external dependencies required.** Uses Node.js built-in `http` module types.

2. **Create the SSE manager:**
```typescript
import { SseStream } from "@radzor/sse-stream";

const sse = new SseStream({
  retryMs: 3000,         // client reconnection hint
  keepAliveInterval: 15000, // prevent proxy timeouts
  maxClients: 1000,
});
```

3. **Create a stream and mount the handler:**
```typescript
import http from "http";

const { handler } = sse.createStream("notifications");

const server = http.createServer((req, res) => {
  if (req.url === "/events/notifications") {
    handler(req, res);
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(3000);
```

4. **Push events to clients:**
```typescript
// Simple string data
sse.pushEvent("notifications", "Hello, world!");

// JSON data with event type
sse.pushEvent("notifications", { userId: 123, action: "login" }, "user-event");

// With explicit event ID for Last-Event-ID tracking
sse.pushEvent("notifications", { message: "New order" }, "order", "evt-42");
```

5. **Listen for connection events:**
```typescript
sse.on("onClientConnected", ({ streamId, clientId, lastEventId }) => {
  console.log(`Client ${clientId} subscribed to ${streamId}`);
  if (lastEventId) {
    // Replay missed events since lastEventId
  }
});

sse.on("onClientDisconnected", ({ streamId, clientId }) => {
  console.log(`Client ${clientId} left ${streamId}`);
});
```

6. **Clean up:**
```typescript
sse.closeStream("notifications"); // disconnects all clients
```

## Environment Variables Required

No environment variables required. Configuration is passed directly.

## Constraints

- Server-only — the `createStream` handler must be mounted on a Node.js HTTP server (works with Express, Fastify, Koa, etc.).
- No external dependencies.
- Clients reconnect automatically using the `retry` field sent on first connection.
- `keepAliveInterval` sends SSE comment frames to prevent proxy/load-balancer timeouts (set to 0 to disable).
- `maxClients` per stream — excess connections receive HTTP 503.
- Event IDs enable `Last-Event-ID` resumption on reconnect.

## Composability

SSE streams are ideal for pushing real-time data from other components (e.g. streaming LLM responses, live notifications). Connections will be configured in a future pass.
