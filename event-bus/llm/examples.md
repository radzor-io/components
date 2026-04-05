# @radzor/event-bus — Usage Examples

## Basic publish/subscribe
```typescript
import { EventBus } from "@radzor/event-bus";

const bus = new EventBus();

bus.subscribe("order.placed", (payload) => {
  console.log("Order placed:", payload);
});

await bus.publish("order.placed", { orderId: "ord-42", total: 99.99 });
// => Order placed: { orderId: 'ord-42', total: 99.99 }
```

## Wildcard subscription for all user events
```typescript
const bus = new EventBus();

bus.subscribe("user.*", (payload) => {
  console.log("User event received:", payload);
});

await bus.publish("user.created", { id: 1 });
await bus.publish("user.deleted", { id: 1 });
await bus.publish("user.updated", { id: 1, email: "new@email.com" });
// All three trigger the handler
```

## One-time handler and unsubscribe
```typescript
const bus = new EventBus();

bus.once("payment.confirmed", (payload) => {
  console.log("Payment confirmed (fires once):", payload);
});

await bus.publish("payment.confirmed", { amount: 50 }); // fires
await bus.publish("payment.confirmed", { amount: 50 }); // no-op, already removed

// Manual unsubscribe
const unsub = bus.subscribe("session.expired", handleExpiry);
// ... later
unsub();
```

## History replay for late subscribers
```typescript
const bus = new EventBus({ historySize: 10 });

// Publish before any subscriber
await bus.publish("app.ready", { version: "1.0" });
await bus.publish("config.loaded", { theme: "dark" });

// Late subscriber immediately replays matching history
bus.subscribe("app.*", (payload) => {
  console.log("Replayed or new:", payload);
});
// Immediately logs: Replayed or new: { version: '1.0' }
```

## Error isolation and monitoring
```typescript
const bus = new EventBus();

bus.on("onHandlerError", ({ event, error }) => {
  logger.error(`Handler failed on event "${event}": ${error.message}`);
});

bus.subscribe("data.processed", () => {
  throw new Error("Handler crash!");
});

bus.subscribe("data.processed", (payload) => {
  console.log("This still runs despite the crash above:", payload);
});

await bus.publish("data.processed", { rows: 100 });
// First handler throws, error is captured; second handler runs normally
```
