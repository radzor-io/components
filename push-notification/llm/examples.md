# push-notification — Examples

## FCM: Send to a device

### TypeScript

```typescript
import { PushNotification } from "./components/push-notification/src";

const push = new PushNotification({
  provider: "fcm",
  credentials: { serverKey: process.env.FCM_SERVER_KEY! },
});

const result = await push.sendToDevice("device-token-abc", {
  title: "Order Shipped",
  body: "Your order #1234 has been shipped",
  data: { orderId: "1234" },
  sound: "default",
});

console.log(result.success, result.messageId);
```

### Python

```python
from components.push_notification.src import PushNotification, FcmCredentials, PushPayload

push = PushNotification("fcm", FcmCredentials(server_key=os.environ["FCM_SERVER_KEY"]))

result = push.send_to_device("device-token-abc", PushPayload(
    title="Order Shipped",
    body="Your order #1234 has been shipped",
    data={"orderId": "1234"},
))

print(result.success, result.message_id)
```

## FCM: Send to a topic

### TypeScript

```typescript
await push.sendToTopic("news", {
  title: "Breaking News",
  body: "New article published",
});
```

### Python

```python
push.send_to_topic("news", PushPayload(title="Breaking News", body="New article published"))
```

## APNs: Send to an iOS device

### TypeScript

```typescript
const push = new PushNotification({
  provider: "apns",
  credentials: {
    keyId: process.env.APNS_KEY_ID!,
    teamId: process.env.APNS_TEAM_ID!,
    privateKey: process.env.APNS_PRIVATE_KEY!,
    bundleId: "com.example.app",
    production: false,
  },
});

await push.sendToDevice("apns-device-token", {
  title: "Reminder",
  body: "Don't forget your meeting at 3pm",
  badge: 1,
});
```

### Python

```python
from components.push_notification.src import PushNotification, ApnsCredentials, PushPayload

push = PushNotification("apns", ApnsCredentials(
    key_id=os.environ["APNS_KEY_ID"],
    team_id=os.environ["APNS_TEAM_ID"],
    private_key=os.environ["APNS_PRIVATE_KEY"],
    bundle_id="com.example.app",
))

push.send_to_device("apns-device-token", PushPayload(
    title="Reminder",
    body="Don't forget your meeting at 3pm",
    badge=1,
))
```

## Error handling

### TypeScript

```typescript
push.on("onError", (err) => console.error(err.code, err.message));
push.on("onSent", (result) => console.log("Sent:", result.messageId));
```

### Python

```python
push.on("onError", lambda err: print(err["code"], err["message"]))
push.on("onSent", lambda result: print("Sent:", result.message_id))
```
