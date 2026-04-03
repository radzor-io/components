# @radzor/webhook-receiver — Usage Examples

## TypeScript

### Generic HMAC webhook (Express)
```typescript
import { WebhookReceiver } from "@radzor/webhook-receiver";
import express from "express";

const app = express();
const webhook = new WebhookReceiver({
  secret: process.env.WEBHOOK_SECRET!,
});

app.post("/webhooks", express.raw({ type: "*/*" }), (req, res) => {
  try {
    const event = webhook.verify(req.body, req.headers["x-signature-256"]);
    console.log(`Event: ${event.eventType}`, event.data);
    res.sendStatus(200);
  } catch {
    res.sendStatus(403);
  }
});
```

### Stripe webhook
```typescript
const stripeWebhook = new WebhookReceiver({
  secret: process.env.STRIPE_WEBHOOK_SECRET!,
});

app.post("/webhooks/stripe", express.raw({ type: "*/*" }), (req, res) => {
  const event = stripeWebhook.verifyStripe(
    req.body.toString(),
    req.headers["stripe-signature"]
  );

  switch (event.eventType) {
    case "checkout.session.completed":
      handleCheckout(event.data);
      break;
    case "invoice.paid":
      handleInvoice(event.data);
      break;
  }
  res.sendStatus(200);
});
```

### Event listeners for monitoring
```typescript
webhook.on("onVerified", ({ eventType }) => {
  metrics.increment("webhook.verified", { type: eventType });
});

webhook.on("onRejected", ({ reason, code }) => {
  logger.warn(`Webhook rejected: ${code} — ${reason}`);
  metrics.increment("webhook.rejected", { code });
});
```

## Python

### Generic webhook (Flask)
```python
from flask import Flask, request
from webhook_receiver import WebhookReceiver, WebhookReceiverConfig
import os

app = Flask(__name__)
webhook = WebhookReceiver(WebhookReceiverConfig(
    secret=os.environ["WEBHOOK_SECRET"],
))

@app.route("/webhooks", methods=["POST"])
def handle():
    try:
        event = webhook.verify(
            request.get_data(as_text=True),
            request.headers.get("X-Signature-256", ""),
        )
        print(f"Event: {event.event_type}", event.data)
        return "", 200
    except ValueError:
        return "", 403
```

### Stripe webhook (FastAPI)
```python
from fastapi import FastAPI, Request, HTTPException
from webhook_receiver import WebhookReceiver, WebhookReceiverConfig
import os

app = FastAPI()
stripe_wh = WebhookReceiver(WebhookReceiverConfig(
    secret=os.environ["STRIPE_WEBHOOK_SECRET"],
))

@app.post("/webhooks/stripe")
async def stripe_webhook(request: Request):
    body = (await request.body()).decode()
    sig = request.headers.get("stripe-signature", "")
    try:
        event = stripe_wh.verify_stripe(body, sig)
    except ValueError:
        raise HTTPException(status_code=403)

    if event.event_type == "checkout.session.completed":
        handle_checkout(event.data)
    return {"ok": True}
```

### GitHub webhook
```python
github_wh = WebhookReceiver(WebhookReceiverConfig(
    secret=os.environ["GITHUB_WEBHOOK_SECRET"],
    signature_header="X-Hub-Signature-256",
))

@app.route("/webhooks/github", methods=["POST"])
def github_webhook():
    event = github_wh.verify(
        request.get_data(as_text=True),
        request.headers.get("X-Hub-Signature-256", ""),
    )
    print(f"GitHub event: {event.event_type}")
    return "", 200
```
