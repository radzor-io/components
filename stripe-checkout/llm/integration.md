# How to integrate @radzor/stripe-checkout

## Overview
Simplified Stripe Checkout integration. Creates checkout sessions, handles payment webhooks, and manages subscription lifecycle.

## Integration Steps

### TypeScript

1. **Install dependency**: `npm install stripe`

2. **Configure the component**:
```typescript
import { StripeCheckout } from "@radzor/stripe-checkout";

const checkout = new StripeCheckout({
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
  priceId: "price_1234...",
  successUrl: "https://myapp.com/success?session_id={CHECKOUT_SESSION_ID}",
  cancelUrl: "https://myapp.com/cancel",
  mode: "payment", // or "subscription"
});
```

3. **Create a checkout session** (API route):
```typescript
const session = await checkout.createCheckout("customer@example.com");
// Redirect user to session.url
```

4. **Handle webhooks** (webhook endpoint):
```typescript
const event = await checkout.handleWebhook(rawBody, req.headers["stripe-signature"]);
```

5. **Listen for events**:
```typescript
checkout.on("onPaymentSuccess", ({ sessionId, customerId, amount }) => {
  // Fulfill order
});
```

### Python

1. **Install dependency**: `pip install stripe`

2. **Configure the component**:
```python
import os
from stripe_checkout import StripeCheckout, StripeCheckoutConfig

checkout = StripeCheckout(StripeCheckoutConfig(
    secret_key=os.environ["STRIPE_SECRET_KEY"],
    webhook_secret=os.environ["STRIPE_WEBHOOK_SECRET"],
    price_id="price_1234...",
    success_url="https://myapp.com/success?session_id={CHECKOUT_SESSION_ID}",
    cancel_url="https://myapp.com/cancel",
    mode="payment",
))
```

3. **Create a checkout session**:
```python
session = checkout.create_checkout("customer@example.com")
# Redirect to session.url
```

4. **Handle webhooks** (Flask):
```python
@app.route("/webhooks/stripe", methods=["POST"])
def stripe_webhook():
    event = checkout.handle_webhook(request.data, request.headers["Stripe-Signature"])
    return "", 200
```

5. **Listen for events**:
```python
checkout.on("onPaymentSuccess", lambda e: print(f"Paid: {e['sessionId']}"))
```

## Environment Variables Required
- `STRIPE_SECRET_KEY` — Stripe secret key (sk_live_... or sk_test_...)
- `STRIPE_WEBHOOK_SECRET` — Webhook signing secret (whsec_...)

## Constraints
- Webhook endpoint must be publicly accessible and receive raw body (not parsed JSON).
- Use test mode keys during development.
- For subscriptions, create Products and Prices in the Stripe Dashboard first.

## Composability
- `paymentStatus` output connects to `@radzor/access-control.input.paymentStatus`.
