# How to integrate @radzor/payment-refund

## Overview
Process full and partial refunds via the Stripe API. Create refunds against payment intents, check refund status, and react to refund lifecycle events through webhooks. Uses raw `fetch()` — no Stripe SDK required.

## Integration Steps

### TypeScript

1. **Import and configure**:
```typescript
import { PaymentRefund } from "@radzor/payment-refund";

const refunds = new PaymentRefund({
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
});
```

2. **Create a full refund**:
```typescript
const result = await refunds.createRefund("pi_abc123");
console.log(result.id, result.status); // "re_xxx", "succeeded"
```

3. **Create a partial refund** (amount in cents):
```typescript
const partial = await refunds.createRefund("pi_abc123", 500, "requested_by_customer");
// Refunds $5.00
```

4. **Check refund status**:
```typescript
const status = await refunds.getRefundStatus("re_xyz789");
console.log(status.status); // "succeeded" | "pending" | "failed"
```

5. **Listen for events**:
```typescript
refunds.on("onRefundCompleted", ({ refundId, amount, currency }) => {
  console.log(`Refund ${refundId}: ${amount} ${currency}`);
});

refunds.on("onRefundFailed", ({ refundId, reason }) => {
  console.error(`Refund ${refundId} failed: ${reason}`);
});
```

6. **Handle webhooks**:
```typescript
app.post("/webhooks/stripe", express.raw({ type: "application/json" }), (req, res) => {
  refunds.handleWebhook(req.body.toString(), req.headers["stripe-signature"]!);
  res.sendStatus(200);
});
```

### Python

1. **Configure**:
```python
import os
from payment_refund import PaymentRefund

refunds = PaymentRefund(
    secret_key=os.environ["STRIPE_SECRET_KEY"],
    webhook_secret=os.environ["STRIPE_WEBHOOK_SECRET"],
)
```

2. **Create a refund**:
```python
result = refunds.create_refund("pi_abc123", amount=500, reason="requested_by_customer")
print(result.status)
```

3. **Handle webhooks** (Flask):
```python
@app.route("/webhooks/stripe", methods=["POST"])
def webhook():
    refunds.handle_webhook(request.data, request.headers["Stripe-Signature"])
    return "", 200
```

## Environment Variables Required
- `STRIPE_SECRET_KEY` — Stripe secret key (sk_live_... or sk_test_...)
- `STRIPE_WEBHOOK_SECRET` — Stripe webhook signing secret (whsec_...)

## Constraints
- Refunds can only be issued for payments less than 180 days old.
- Partial refund amounts are in the smallest currency unit (e.g. cents for USD).
- Multiple partial refunds can be issued until the total equals the original charge.
- Refunds take 5-10 business days to appear on customer statements.
- Webhook endpoint must be publicly accessible.

## Composability
- `onRefundCompleted` event can trigger `@radzor/email-send` for refund confirmation.
- `onRefundFailed` event can trigger `@radzor/slack-bot` for ops alerts.
