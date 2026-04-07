# How to integrate @radzor/push-notification

## Overview
Send push notifications via Firebase Cloud Messaging (FCM) or Apple Push Notification service (APNs).

## Integration Steps

### TypeScript

1. **No external dependencies required.** This component uses native APIs only.

2. **Create an instance:**
```typescript
import { PushNotification } from "@radzor/push-notification";

const pushNotification = new PushNotification({
  provider: "fcm",
});
```

3. **Use the component:**
```typescript
const result = await pushNotification.sendToDevice("example-token", "example-notification");
const result = await pushNotification.sendToTopic("example-topic", "example-notification");
```

### Python

```python
from push_notification import PushNotification, PushNotificationConfig
import os

pushNotification = PushNotification(PushNotificationConfig(
    provider="fcm",
))
```

## Events

- **onSent** — Fired when a notification is successfully sent. Payload: `messageId: string`, `token: string`
- **onError** — Fired on send error. Payload: `code: string`, `message: string`, `token: string`
