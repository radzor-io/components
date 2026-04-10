# How to integrate @radzor/subscription-billing

## Overview
Manage recurring subscriptions with Stripe Billing. Create, update, cancel subscriptions, and handle lifecycle events like payment failures and renewals. Uses raw `fetch()` against the Stripe REST API — no SDK dependency required.

## Integration Steps

### TypeScript

1. **Import and configure**:
```typescript
import { SubscriptionBilling } from "@radzor/subscription-billing";

const billing = new SubscriptionBilling({
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
  defaultCurrency: "usd",
});
```

2. **Create a subscription** for an existing Stripe customer:
```typescript
const sub = await billing.createSubscription("cus_abc123", "price_monthly_pro", 14);
console.log(sub.id, sub.status); // "sub_xxx", "trialing"
```

3. **Listen for lifecycle events**:
```typescript
billing.on("onSubscriptionCreated", ({ subscriptionId, customerId }) => {
  // Provision access
});

billing.on("onPaymentFailed", ({ subscriptionId, attemptCount }) => {
  // Notify customer, retry logic
});
```

4. **Handle webhooks** (Express endpoint):
```typescript
app.post("/webhooks/stripe", express.raw({ type: "application/json" }), (req, res) => {
  billing.handleWebhook(req.body.toString(), req.headers["stripe-signature"]!);
  res.sendStatus(200);
});
```

### Python

1. **Configure**:
```python
import os
from subscription_billing import SubscriptionBilling

billing = SubscriptionBilling(
    secret_key=os.environ["STRIPE_SECRET_KEY"],
    webhook_secret=os.environ["STRIPE_WEBHOOK_SECRET"],
)
```

2. **Create a subscription**:
```python
sub = billing.create_subscription("cus_abc123", "price_monthly_pro", trial_days=14)
print(sub.id, sub.status)
```

3. **Handle webhooks** (Flask):
```python
@app.route("/webhooks/stripe", methods=["POST"])
def stripe_webhook():
    billing.handle_webhook(request.data, request.headers["Stripe-Signature"])
    return "", 200
```

## Environment Variables Required
- `STRIPE_SECRET_KEY` — Stripe secret key (sk_live_... or sk_test_...)
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook signing secret (whsec_...)

## Constraints
- Customers must be created in Stripe before subscriptions can be made.
- Webhook endpoint must be publicly accessible and receive raw body (not parsed JSON).
- Use test mode keys during development (`sk_test_...`).
- Prices must be created in the Stripe Dashboard or via API before referencing them.

## Composability
- `onPaymentFailed` event can trigger `@radzor/email-send` to notify the customer.
- `onSubscriptionCreated` event can trigger `@radzor/email-send` for welcome emails.
