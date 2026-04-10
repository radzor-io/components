# How to integrate @radzor/websocket-server

## Overview
WebSocket server with room-based messaging, client management, heartbeat monitoring, and broadcasting. Built on the `ws` npm package for Node.js.

## Integration Steps

### TypeScript

1. **Install the dependency:**
```bash
npm install ws
npm install -D @types/ws
```

2. **Create and start the server:**
```typescript
import { WsServer } from "@radzor/websocket-server";

const server = new WsServer({
  port: 8080,
  path: "/ws",
  maxPayloadSize: 1048576, // 1MB
  heartbeatInterval: 30000, // 30s
});

await server.start();
console.log("WebSocket server running on ws://localhost:8080/ws");
```

3. **Handle events:**
```typescript
server.on("onConnection", ({ clientId, remoteAddress }) => {
  console.log(`Client ${clientId} connected from ${remoteAddress}`);
  server.joinRoom(clientId, "lobby");
});

server.on("onMessage", ({ clientId, data }) => {
  const msg = JSON.parse(data);
  // Echo to room
  server.broadcast(data, "lobby", clientId);
});

server.on("onDisconnect", ({ clientId, code, reason }) => {
  console.log(`Client ${clientId} disconnected: ${code} ${reason}`);
});
```

4. **Room management:**
```typescript
server.joinRoom(clientId, "game-room-42");
server.broadcast(JSON.stringify({ event: "player-joined" }), "game-room-42");
server.leaveRoom(clientId, "game-room-42");
```

5. **Shutdown:**
```typescript
await server.stop();
```

## Environment Variables Required

No environment variables required. Port and configuration are passed directly.

## Constraints

- Requires the `ws` npm package (v8+).
- Server-only — does not run in browsers.
- Each client is assigned a UUID on connection.
- Rooms are created automatically on first `joinRoom` and removed when empty.
- Set `heartbeatInterval` to 0 to disable ping/pong keepalive.
- Binary messages are emitted as hex-encoded strings in `onMessage`.
- `maxPayloadSize` disconnects clients that send oversized messages.

## Composability

WebSocket messages can trigger downstream processing (e.g. broadcasting chat messages, updating state). Connections will be configured in a future pass.
