# How to integrate @radzor/webhook-receiver

## Overview
Secure webhook receiver with HMAC signature verification, replay protection, and event routing. Supports Stripe, GitHub, Shopify, and custom webhook sources.

## Integration Steps

### TypeScript

1. **Configure the component**:
```typescript
import { WebhookReceiver } from "@radzor/webhook-receiver";

const webhook = new WebhookReceiver({
  secret: process.env.WEBHOOK_SECRET!,
  algorithm: "sha256",
  tolerance: 300, // reject events older than 5 minutes
});
```

2. **Verify incoming webhooks** (Express):
```typescript
app.post("/webhooks", express.raw({ type: "*/*" }), (req, res) => {
  try {
    const event = webhook.verify(
      req.body,
      req.headers["x-signature-256"] as string,
      req.headers["x-timestamp"] as string
    );
    console.log(event.eventType, event.data);
    res.sendStatus(200);
  } catch {
    res.sendStatus(403);
  }
});
```

3. **Stripe-specific verification**:
```typescript
const event = webhook.verifyStripe(rawBody, req.headers["stripe-signature"]);
```

### Python

No external dependencies — uses `hmac` and `hashlib` from stdlib.

1. **Configure**:
```python
from webhook_receiver import WebhookReceiver, WebhookReceiverConfig
import os

webhook = WebhookReceiver(WebhookReceiverConfig(
    secret=os.environ["WEBHOOK_SECRET"],
    algorithm="sha256",
    tolerance=300,
))
```

2. **Verify** (Flask):
```python
@app.route("/webhooks", methods=["POST"])
def handle_webhook():
    try:
        event = webhook.verify(
            request.get_data(as_text=True),
            request.headers.get("X-Signature-256", ""),
            request.headers.get("X-Timestamp"),
        )
        print(event.event_type, event.data)
        return "", 200
    except ValueError:
        return "", 403
```

## Environment Variables Required
- `WEBHOOK_SECRET` — Shared secret for signature verification.

## Constraints
- Must receive raw request body (not parsed JSON) for signature verification.
- Configure your framework to preserve the raw body.

## Composability
- Verified payloads can be passed to `@radzor/queue-worker` for async processing.
