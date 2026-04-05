# How to integrate @radzor/event-bus

## Overview
This component is a zero-dependency in-process typed pub/sub bus. It supports wildcard patterns (e.g. `user.*`), history replay for late subscribers, async handler isolation (errors are caught and re-emitted as `onHandlerError`), and one-time subscriptions.

## Integration Steps

1. **Install**: Copy `src/index.ts` into your project or import from the package.

2. **Create a shared bus instance** (typically a singleton):
```typescript
import { EventBus } from "@radzor/event-bus";

export const bus = new EventBus({
  maxListeners: 100,   // max concurrent subscriptions, default: 100
  historySize: 50,     // events to replay for late subscribers, default: 0 (disabled)
  asyncHandlers: true, // await all handlers per publish, default: true
});
```

3. **Subscribe to events**:
```typescript
// Exact match
const unsub = bus.subscribe("user.created", (payload) => {
  console.log("New user:", payload);
});

// Wildcard — matches user.created, user.deleted, user.updated
const unsubAll = bus.subscribe("user.*", (payload) => {
  console.log("User event:", payload);
});

// One-time handler
bus.once("order.paid", (payload) => {
  sendConfirmationEmail(payload);
});
```

4. **Publish events**:
```typescript
const result = await bus.publish("user.created", { id: 1, email: "a@b.com" });
console.log(`Notified ${result.handlersInvoked} handlers`);
```

5. **Unsubscribe**:
```typescript
unsub();                          // Remove a single subscription
bus.unsubscribeAll("user.*");     // Remove all handlers matching pattern
bus.unsubscribeAll();             // Remove all handlers on the bus
```

6. **Monitor bus activity**:
```typescript
bus.on("onPublish", ({ event, handlersInvoked }) => {
  console.log(`[bus] ${event} → ${handlersInvoked} handlers`);
});

bus.on("onHandlerError", ({ event, error }) => {
  console.error(`[bus] handler error on ${event}:`, error);
});
```

## Constraints
- In-process only. Events do not cross process or network boundaries.
- Wildcard `*` matches exactly one segment: `user.*` matches `user.created` but not `user.role.changed`.
- Handler errors are isolated and do not abort other handlers; they emit `onHandlerError` instead.

## Composability
- Use as the internal event spine connecting `@radzor/queue-worker` job completions to downstream handlers.
- Combine with `@radzor/realtime-chat` — publish chat messages to the bus for fan-out to multiple consumers.
