# How to integrate @radzor/notification-hub

## Overview
Fan-out notifications to multiple channels: email (SendGrid/SMTP), SMS (Twilio), push (FCM), Slack (webhooks), and generic webhooks. Register channels dynamically, send to multiple at once, and track delivery with automatic retries.

## Integration Steps

### TypeScript

1. **No external dependencies required.** All transports use native `fetch()`.

2. **Create an instance:**
```typescript
import { NotificationHub } from "@radzor/notification-hub";

const hub = new NotificationHub({
  defaultChannels: ["email", "slack"],
  retryAttempts: 2,
});
```

3. **Register channels:**
```typescript
hub.registerChannel("email", "email", {
  sendgridApiKey: process.env.SENDGRID_API_KEY!,
  fromEmail: "alerts@example.com",
});

hub.registerChannel("slack", "slack", {
  webhookUrl: process.env.SLACK_WEBHOOK_URL!,
});

hub.registerChannel("sms", "sms", {
  twilioAccountSid: process.env.TWILIO_SID!,
  twilioAuthToken: process.env.TWILIO_TOKEN!,
  twilioFrom: "+15551234567",
});
```

4. **Send a notification:**
```typescript
const { results } = await hub.send({
  title: "Server Alert",
  body: "CPU usage exceeded 90%",
  recipient: "ops@example.com",
  channels: ["email", "slack"], // optional, uses defaultChannels if omitted
});

for (const r of results) {
  console.log(`${r.channel}: ${r.success ? "delivered" : r.error}`);
}
```

5. **Listen for events:**
```typescript
hub.on("onDelivered", (e) => console.log(`Delivered via ${e.channelName}`));
hub.on("onFailed", (e) => console.error(`Failed on ${e.channelName}: ${e.error}`));
```

### Python

```python
from notification_hub import NotificationHub, NotificationHubConfig
import os

hub = NotificationHub(NotificationHubConfig(
    default_channels=["email", "slack"],
    retry_attempts=2,
))

hub.register_channel("email", "email", {
    "sendgrid_api_key": os.environ["SENDGRID_API_KEY"],
    "from_email": "alerts@example.com",
})

hub.register_channel("slack", "slack", {
    "webhook_url": os.environ["SLACK_WEBHOOK_URL"],
})

results = hub.send(title="Alert", body="CPU > 90%", recipient="ops@example.com")
```

## Environment Variables Required

Depends on which channels you register:

| Variable | Channel | Description |
|---|---|---|
| `SENDGRID_API_KEY` | email | SendGrid API key |
| `TWILIO_SID` | sms | Twilio Account SID |
| `TWILIO_TOKEN` | sms | Twilio Auth Token |
| `SLACK_WEBHOOK_URL` | slack | Slack Incoming Webhook URL |
| `FCM_SERVER_KEY` | push | Firebase Cloud Messaging server key |

## Constraints

- Each channel type requires its own credentials passed in the `config` parameter to `registerChannel`.
- Email transport supports SendGrid API or SMTP via an HTTP bridge (`smtpApiUrl`).
- SMS transport uses Twilio's REST API.
- Push transport uses FCM legacy HTTP API.
- `recipient` semantics depend on the channel type: email address for email, phone number for SMS, device token for push, ignored for Slack.
- Failed deliveries are retried up to `retryAttempts` times with exponential backoff.

## Composability

The notification hub is a natural downstream target — any component can pipe its events to trigger multi-channel notifications. Connections will be configured in a future pass.
