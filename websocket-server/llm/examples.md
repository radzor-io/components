# @radzor/websocket-server — Usage Examples

## Basic echo server

```typescript
import { WsServer } from "@radzor/websocket-server";

const server = new WsServer({ port: 8080 });
await server.start();

server.on("onConnection", ({ clientId }) => {
  console.log(`New client: ${clientId}`);
  server.sendToClient(clientId, JSON.stringify({ type: "welcome", id: clientId }));
});

server.on("onMessage", ({ clientId, data }) => {
  // Echo back to sender
  server.sendToClient(clientId, data);
});

server.on("onDisconnect", ({ clientId, code }) => {
  console.log(`Client ${clientId} left (code: ${code})`);
});
```

## Chat room with broadcasting

```typescript
const server = new WsServer({ port: 8080, path: "/chat" });
await server.start();

server.on("onConnection", ({ clientId }) => {
  server.joinRoom(clientId, "general");
  server.broadcast(
    JSON.stringify({ type: "system", text: "A new user joined" }),
    "general",
    clientId
  );
});

server.on("onMessage", ({ clientId, data }) => {
  const msg = JSON.parse(data);
  if (msg.type === "chat") {
    server.broadcast(
      JSON.stringify({ type: "chat", from: clientId, text: msg.text }),
      "general",
      clientId // exclude sender
    );
  } else if (msg.type === "join-room") {
    server.joinRoom(clientId, msg.room);
  }
});
```

## Multi-room game server

```typescript
const server = new WsServer({
  port: 9090,
  path: "/game",
  heartbeatInterval: 10000,
  maxPayloadSize: 65536,
});
await server.start();

server.on("onMessage", ({ clientId, data }) => {
  const msg = JSON.parse(data);

  switch (msg.action) {
    case "create-room":
      server.joinRoom(clientId, msg.roomId);
      server.sendToClient(clientId, JSON.stringify({ action: "room-created", roomId: msg.roomId }));
      break;
    case "join-room":
      server.joinRoom(clientId, msg.roomId);
      server.broadcast(
        JSON.stringify({ action: "player-joined", playerId: clientId }),
        msg.roomId,
        clientId
      );
      break;
    case "move":
      server.broadcast(
        JSON.stringify({ action: "player-move", playerId: clientId, position: msg.position }),
        msg.roomId,
        clientId
      );
      break;
  }
});

server.on("onDisconnect", ({ clientId }) => {
  // Broadcast disconnect to all rooms the client was in
  const clients = server.getClients();
  const client = clients.find((c) => c.id === clientId);
  for (const room of client?.rooms ?? []) {
    server.broadcast(
      JSON.stringify({ action: "player-left", playerId: clientId }),
      room
    );
  }
});
```

## Server status monitoring

```typescript
setInterval(() => {
  const info = server.getInfo();
  console.log(`Clients: ${info.clientCount}, Rooms: ${info.roomCount}`);

  const clients = server.getClients();
  for (const c of clients) {
    console.log(`  ${c.id} from ${c.remoteAddress} in rooms: ${c.rooms.join(", ")}`);
  }
}, 10000);
```

## Send targeted messages

```typescript
// Direct message to a specific client
server.sendToClient("client-uuid-123", JSON.stringify({
  type: "dm",
  text: "You have a new notification",
}));

// Broadcast to a room
const sent = server.broadcast(
  JSON.stringify({ type: "announcement", text: "Server restarting in 5 minutes" }),
  "general"
);
console.log(`Announcement sent to ${sent} clients`);
```

## Graceful shutdown

```typescript
process.on("SIGTERM", async () => {
  console.log("Shutting down WebSocket server...");
  server.broadcast(JSON.stringify({ type: "system", text: "Server shutting down" }));
  await server.stop();
  process.exit(0);
});
```
