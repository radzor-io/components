# How to integrate @radzor/whatsapp-send

## Overview
Send WhatsApp messages via the Meta Cloud API. Supports text messages, pre-approved templates, media (images, video, audio, documents), and read receipt management. Processes incoming webhook events for delivery tracking.

## Integration Steps

### TypeScript

1. **No external dependencies required.** Uses native `fetch()`.

2. **Create an instance:**
```typescript
import { WhatsAppSend } from "@radzor/whatsapp-send";

const wa = new WhatsAppSend({
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN!,
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID!,
  apiVersion: "v18.0", // optional
});
```

3. **Send a text message:**
```typescript
const result = await wa.sendText("14155552671", "Hello from Radzor!");
console.log(`Sent message: ${result.messageId}`);
```

4. **Send a template message:**
```typescript
const result = await wa.sendTemplate("14155552671", "order_confirmation", "en_US", [
  {
    type: "body",
    parameters: [{ type: "text", text: "ORDER-123" }],
  },
]);
```

5. **Process webhook events:**
```typescript
// In your webhook handler (Express, Fastify, etc.)
app.post("/webhook", (req, res) => {
  wa.processWebhook(req.body);
  res.sendStatus(200);
});

wa.on("onMessageDelivered", (e) => console.log(`Delivered: ${e.messageId}`));
wa.on("onMessageRead", (e) => console.log(`Read: ${e.messageId}`));
```

### Python

```python
from whatsapp_send import WhatsAppSend, WhatsAppConfig
import os

wa = WhatsAppSend(WhatsAppConfig(
    access_token=os.environ["WHATSAPP_ACCESS_TOKEN"],
    phone_number_id=os.environ["WHATSAPP_PHONE_NUMBER_ID"],
))

result = wa.send_text("14155552671", "Hello from Radzor!")
print(f"Message ID: {result.message_id}")
```

## Environment Variables Required

| Variable | Description |
|---|---|
| `WHATSAPP_ACCESS_TOKEN` | Meta Cloud API access token |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp Business phone number ID |

## Constraints

- Template messages must be pre-approved by Meta before use.
- Phone numbers must be in international format without the `+` prefix (e.g. `14155552671`).
- Media URLs must be publicly accessible HTTPS URLs.
- Either `mediaUrl` or `mediaId` is required for `sendMedia` — not both.
- Rate limits apply per the Meta Business API tier.
- To receive delivery/read events, configure a webhook URL in the Meta dashboard.

## Composability

Message delivery events can trigger downstream notifications or logging. Connections will be configured in a future pass.
