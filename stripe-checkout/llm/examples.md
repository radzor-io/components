# @radzor/stripe-checkout — Usage Examples

## One-time payment (Express)
```typescript
import { StripeCheckout } from "@radzor/stripe-checkout";

const checkout = new StripeCheckout({
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
  priceId: "price_abc123",
  successUrl: "https://myapp.com/success?session_id={CHECKOUT_SESSION_ID}",
  cancelUrl: "https://myapp.com/pricing",
  mode: "payment",
});

app.post("/api/checkout", async (req, res) => {
  const session = await checkout.createCheckout(req.body.email);
  res.json({ url: session.url });
});
```

## Subscription checkout
```typescript
const checkout = new StripeCheckout({
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
  priceId: "price_monthly_pro",
  successUrl: "https://myapp.com/dashboard",
  cancelUrl: "https://myapp.com/pricing",
  mode: "subscription",
});

const session = await checkout.createCheckout("user@example.com");
// Redirect to session.url
```

## Webhook handler (Express with raw body)
```typescript
app.post("/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const event = await checkout.handleWebhook(
      req.body.toString(),
      req.headers["stripe-signature"]!
    );
    console.log("Webhook event:", event.type);
    res.sendStatus(200);
  }
);
```

## Event-driven order fulfillment
```typescript
checkout.on("onPaymentSuccess", async ({ sessionId, customerId, amount }) => {
  await db.orders.create({
    stripeSessionId: sessionId,
    customerId,
    amount,
    status: "paid",
  });
  await sendConfirmationEmail(customerId);
});

checkout.on("onPaymentFailed", ({ sessionId, error }) => {
  console.error(`Payment failed for ${sessionId}: ${error}`);
});
```

## Cancel subscription
```typescript
app.post("/api/cancel-subscription", async (req, res) => {
  await checkout.cancelSubscription(req.body.subscriptionId);
  res.json({ message: "Subscription will cancel at end of period" });
});
```

## Check payment status
```typescript
app.get("/api/payment-status/:sessionId", async (req, res) => {
  const status = await checkout.getPaymentStatus(req.params.sessionId);
  res.json({ status });
});
```

---

## Python Examples

### One-time payment (Flask)
```python
import os
from flask import Flask, request, jsonify
from stripe_checkout import StripeCheckout, StripeCheckoutConfig

app = Flask(__name__)
checkout = StripeCheckout(StripeCheckoutConfig(
    secret_key=os.environ["STRIPE_SECRET_KEY"],
    webhook_secret=os.environ["STRIPE_WEBHOOK_SECRET"],
    price_id="price_abc123",
    success_url="https://myapp.com/success?session_id={CHECKOUT_SESSION_ID}",
    cancel_url="https://myapp.com/pricing",
    mode="payment",
))

@app.route("/api/checkout", methods=["POST"])
def create_checkout():
    session = checkout.create_checkout(request.json.get("email"))
    return jsonify(url=session.url)
```

### Subscription (FastAPI)
```python
from fastapi import FastAPI

app = FastAPI()

checkout = StripeCheckout(StripeCheckoutConfig(
    secret_key=os.environ["STRIPE_SECRET_KEY"],
    webhook_secret=os.environ["STRIPE_WEBHOOK_SECRET"],
    price_id="price_monthly_pro",
    success_url="https://myapp.com/dashboard",
    cancel_url="https://myapp.com/pricing",
    mode="subscription",
))

@app.post("/api/checkout")
def create_checkout(email: str):
    session = checkout.create_checkout(email)
    return {"url": session.url}
```

### Webhook handler (Flask)
```python
@app.route("/webhooks/stripe", methods=["POST"])
def webhook():
    event = checkout.handle_webhook(request.data, request.headers["Stripe-Signature"])
    print(f"Event: {event.type}")
    return "", 200
```

### Event-driven fulfillment
```python
checkout.on("onPaymentSuccess", lambda e: db.orders.create(
    stripe_session_id=e["sessionId"],
    customer_id=e["customerId"],
    amount=e["amount"],
))
checkout.on("onPaymentFailed", lambda e: print(f"Failed: {e['error']}"))
```

### Cancel subscription
```python
checkout.cancel_subscription("sub_123abc")
```
