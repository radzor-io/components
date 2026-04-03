# How to integrate @radzor/realtime-chat

## Overview
WebSocket-based real-time chat. Supports rooms, typing indicators, message history buffer, user presence events, and automatic reconnection with exponential backoff.

## Integration Steps

1. **Create an instance**:
```typescript
import { RealtimeChat } from "@radzor/realtime-chat";

const chat = new RealtimeChat({
  roomId: "room-123",
  userId: "user-456",
  serverUrl: "wss://myapp.com/ws",
  maxMessages: 100,        // local buffer size, default: 100
  authToken: session.accessToken, // optional, from @radzor/auth-oauth
});
```

2. **Listen for events**:
```typescript
chat.on("onMessage", ({ id, userId, content, timestamp }) => {
  renderMessage({ userId, content, timestamp });
});

chat.on("onUserJoin", ({ userId, username }) => {
  showNotification(`${username} joined`);
});

chat.on("onTyping", ({ userId, isTyping }) => {
  toggleTypingIndicator(userId, isTyping);
});
```

3. **Join and interact**:
```typescript
await chat.joinRoom();
await chat.sendMessage("Hello!");
chat.setTyping(true);
```

4. **Leave**:
```typescript
await chat.leaveRoom();
```

## WebSocket Server Protocol
The component expects a WebSocket server that handles JSON messages with these types:
- `{ type: "join", roomId, userId }` — join a room
- `{ type: "leave", roomId, userId }` — leave a room
- `{ type: "message", roomId, id, userId, content, timestamp }` — send/receive message
- `{ type: "typing", roomId, userId, isTyping }` — typing indicator
- `{ type: "user_join", userId, username }` — server broadcasts user join
- `{ type: "user_leave", userId }` — server broadcasts user leave
- `{ type: "history", messages: [...] }` — server sends message history
- `{ type: "error", code, message }` — server error

## Constraints
- Requires a WebSocket server implementing the protocol above.
- For production, use `wss://` (TLS).
- Auto-reconnects with exponential backoff (max 5 attempts, up to 30s delay).
- Message history is local buffer only — the server should send history on join.

## Composability
- Accepts `@radzor/auth-oauth.output.session` as `authToken` input.
- `messageStream` output connects to `@radzor/ai-responder.input.messageStream`.
