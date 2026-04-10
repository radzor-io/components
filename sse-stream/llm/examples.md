# @radzor/sse-stream — Usage Examples

## Basic SSE server with Express

```typescript
import { SseStream } from "@radzor/sse-stream";
import express from "express";

const sse = new SseStream({ retryMs: 3000, keepAliveInterval: 15000 });
const { handler } = sse.createStream("updates");

const app = express();
app.get("/events", handler);
app.listen(3000);

// Push events from anywhere in your app
setInterval(() => {
  sse.pushEvent("updates", { time: new Date().toISOString() }, "tick");
}, 1000);
```

## Multiple named streams

```typescript
const sse = new SseStream();

const orders = sse.createStream("orders");
const alerts = sse.createStream("alerts");

const app = express();
app.get("/events/orders", orders.handler);
app.get("/events/alerts", alerts.handler);
app.listen(3000);

// Push to specific streams
sse.pushEvent("orders", { orderId: "ORD-123", status: "shipped" }, "order-update");
sse.pushEvent("alerts", { level: "warning", message: "High memory usage" }, "alert");
```

## Stream LLM responses in real-time

```typescript
const sse = new SseStream({ keepAliveInterval: 10000 });
const { handler } = sse.createStream("ai-response");

app.get("/stream/ai", handler);

async function streamCompletion(prompt: string) {
  // Simulate chunked LLM response
  const words = "The answer to your question is as follows...".split(" ");
  for (const word of words) {
    sse.pushEvent("ai-response", { token: word + " " }, "token");
    await new Promise((r) => setTimeout(r, 100));
  }
  sse.pushEvent("ai-response", { done: true }, "complete");
}
```

## Track client connections

```typescript
const sse = new SseStream({ maxClients: 500 });
sse.createStream("live-feed");

sse.on("onClientConnected", ({ streamId, clientId, lastEventId }) => {
  console.log(`Client ${clientId} joined ${streamId}`);
  if (lastEventId) {
    console.log(`  Resuming from event ${lastEventId}`);
  }
  // Send current state to new client
  sse.pushEvent(streamId, { type: "snapshot", data: getCurrentState() });
});

sse.on("onClientDisconnected", ({ streamId, clientId }) => {
  console.log(`Client ${clientId} left ${streamId}`);
  const info = sse.getStreamInfo(streamId);
  console.log(`  Remaining clients: ${info?.clientCount}`);
});
```

## Using with raw Node.js http module

```typescript
import http from "http";
import { SseStream } from "@radzor/sse-stream";

const sse = new SseStream();
const { handler } = sse.createStream("notifications");

const server = http.createServer((req, res) => {
  if (req.url === "/events" && req.method === "GET") {
    handler(req, res);
  } else if (req.url === "/notify" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const data = JSON.parse(body);
      const count = sse.pushEvent("notifications", data, "notification");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ sent: count }));
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(3000);
```

## Clean up streams

```typescript
// Close a specific stream
sse.closeStream("orders");

// List active streams
const active = sse.getActiveStreams();
console.log("Active streams:", active);

// Get stream stats
const info = sse.getStreamInfo("alerts");
if (info) {
  console.log(`${info.streamId}: ${info.clientCount} clients, ${info.totalEventsSent} events`);
}
```
