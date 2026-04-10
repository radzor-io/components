# @radzor/notification-hub — Usage Examples

## Register channels and send a notification

```typescript
import { NotificationHub } from "@radzor/notification-hub";

const hub = new NotificationHub({
  defaultChannels: ["email", "slack"],
  retryAttempts: 2,
});

hub.registerChannel("email", "email", {
  sendgridApiKey: process.env.SENDGRID_API_KEY!,
  fromEmail: "alerts@myapp.com",
});

hub.registerChannel("slack", "slack", {
  webhookUrl: process.env.SLACK_WEBHOOK_URL!,
});

const { results } = await hub.send({
  title: "Deployment Complete",
  body: "v2.1.0 deployed to production successfully.",
  recipient: "team@myapp.com",
});

results.forEach((r) => console.log(`${r.channel}: ${r.success ? "OK" : r.error}`));
```

## Multi-channel alert with SMS fallback

```typescript
hub.registerChannel("sms-oncall", "sms", {
  twilioAccountSid: process.env.TWILIO_SID!,
  twilioAuthToken: process.env.TWILIO_TOKEN!,
  twilioFrom: "+15551234567",
});

hub.registerChannel("push", "push", {
  fcmServerKey: process.env.FCM_SERVER_KEY!,
});

// Critical alert: email + SMS + push
const { results } = await hub.send({
  title: "DATABASE DOWN",
  body: "Primary database is unreachable. Failover initiated.",
  recipient: "+15559876543", // phone for SMS, email for email, token for push
  channels: ["email", "sms-oncall", "push"],
  metadata: { severity: "critical", service: "database" },
});
```

## Track delivery status

```typescript
hub.on("onDelivered", ({ channelName, messageId, recipient }) => {
  console.log(`[OK] ${channelName} → ${recipient} (id: ${messageId})`);
});

hub.on("onFailed", ({ channelName, error, recipient, attempts }) => {
  console.error(`[FAIL] ${channelName} → ${recipient}: ${error} (${attempts} attempts)`);
});
```

## Custom webhook channel

```typescript
hub.registerChannel("pagerduty", "webhook", {
  url: "https://events.pagerduty.com/v2/enqueue",
  authHeader: `Token token=${process.env.PD_TOKEN}`,
});

await hub.send({
  title: "High Error Rate",
  body: "Error rate exceeded 5% in the last 5 minutes",
  recipient: "service-key",
  channels: ["pagerduty", "slack"],
});
```

## Dynamic channel management

```typescript
// Add a temporary channel for an on-call rotation
hub.registerChannel("oncall-sms", "sms", {
  twilioAccountSid: process.env.TWILIO_SID!,
  twilioAuthToken: process.env.TWILIO_TOKEN!,
  twilioFrom: "+15551234567",
});

await hub.send({
  title: "Incident",
  body: "Service degradation detected",
  recipient: "+15559876543",
  channels: ["oncall-sms"],
});

// Remove when rotation ends
hub.removeChannel("oncall-sms");
```

## Send to default channels only

```typescript
const hub = new NotificationHub({ defaultChannels: ["email", "slack"] });

hub.registerChannel("email", "email", { sendgridApiKey: "..." , fromEmail: "noreply@app.com" });
hub.registerChannel("slack", "slack", { webhookUrl: "https://hooks.slack.com/..." });

// No channels param — uses defaultChannels
await hub.send({
  title: "Weekly Report",
  body: "All systems nominal. 99.99% uptime this week.",
  recipient: "team@myapp.com",
});
```

---

## Python Examples

### Register and send

```python
from notification_hub import NotificationHub, NotificationHubConfig
import os

hub = NotificationHub(NotificationHubConfig(
    default_channels=["email", "slack"],
    retry_attempts=2,
))

hub.register_channel("email", "email", {
    "sendgrid_api_key": os.environ["SENDGRID_API_KEY"],
    "from_email": "alerts@myapp.com",
})

hub.register_channel("slack", "slack", {
    "webhook_url": os.environ["SLACK_WEBHOOK_URL"],
})

results = hub.send(
    title="Deployment Complete",
    body="v2.1.0 deployed to production.",
    recipient="team@myapp.com",
)
for r in results:
    print(f"{r['channel']}: {'OK' if r['success'] else r['error']}")
```

### Event handling

```python
hub.on("onDelivered", lambda e: print(f"Delivered via {e['channel_name']}"))
hub.on("onFailed", lambda e: print(f"Failed on {e['channel_name']}: {e['error']}"))
```
