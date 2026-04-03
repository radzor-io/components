# @radzor/realtime-chat — Usage Examples

## Basic chat room
```typescript
import { RealtimeChat } from "@radzor/realtime-chat";

const chat = new RealtimeChat({
  roomId: "general",
  userId: "user-1",
  serverUrl: "wss://chat.myapp.com/ws",
});

chat.on("onMessage", (msg) => {
  console.log(`[${msg.userId}]: ${msg.content}`);
});

await chat.joinRoom();
await chat.sendMessage("Hello everyone!");
```

## React integration
```typescript
function ChatRoom({ roomId, userId }: { roomId: string; userId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const chatRef = useRef<RealtimeChat | null>(null);

  useEffect(() => {
    const chat = new RealtimeChat({
      roomId,
      userId,
      serverUrl: "wss://chat.myapp.com/ws",
    });

    chat.on("onMessage", (msg) => {
      setMessages((prev) => [...prev, msg]);
    });

    chat.joinRoom();
    chatRef.current = chat;

    return () => { chat.leaveRoom(); };
  }, [roomId, userId]);

  const send = async (text: string) => {
    await chatRef.current?.sendMessage(text);
  };

  return (
    <div>
      {messages.map((m) => (
        <div key={m.id}><b>{m.userId}</b>: {m.content}</div>
      ))}
      <input onKeyDown={(e) => {
        if (e.key === "Enter") {
          send(e.currentTarget.value);
          e.currentTarget.value = "";
        }
      }} />
    </div>
  );
}
```

## Typing indicators
```typescript
const input = document.getElementById("chat-input");

input.addEventListener("input", () => {
  chat.setTyping(true);
  // Auto-clears after 3 seconds of inactivity
});

chat.on("onTyping", ({ userId, isTyping }) => {
  if (isTyping) {
    typingEl.textContent = `${userId} is typing...`;
  } else {
    typingEl.textContent = "";
  }
});
```

## With auth-oauth session
```typescript
import { AuthOAuth } from "@radzor/auth-oauth";
import { RealtimeChat } from "@radzor/realtime-chat";

const auth = new AuthOAuth({ /* ... */ });
const session = auth.getSession();

const chat = new RealtimeChat({
  roomId: "private-room",
  userId: auth.getUser()!.id,
  serverUrl: "wss://chat.myapp.com/ws",
  authToken: session?.accessToken,
});

await chat.joinRoom();
```

## Switch rooms
```typescript
await chat.leaveRoom();
await chat.joinRoom("new-room-id");
```

## Connection status monitoring
```typescript
setInterval(() => {
  const status = chat.connectionStatus;
  statusEl.textContent = status;
  statusEl.className = status === "connected" ? "green" : "red";
}, 1000);
```
