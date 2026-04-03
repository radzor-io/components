# How to integrate @radzor/stripe-checkout

## Overview
Simplified Stripe Checkout integration. Creates checkout sessions, handles payment webhooks, and manages subscription lifecycle.

## Integration Steps

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
  // Fulfill order, grant access, etc.
});

checkout.on("onSubscriptionCreated", ({ subscriptionId, customerId }) => {
  // Activate subscription in your database
});
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
