# @radzor/payment-refund — Usage Examples

## Full refund
```typescript
import { PaymentRefund } from "@radzor/payment-refund";

const refunds = new PaymentRefund({
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
});

// Refund the entire payment
const result = await refunds.createRefund("pi_3abc123");
console.log(result.id, result.status, result.amount);
```

## Partial refund (Express endpoint)
```typescript
app.post("/api/refund", async (req, res) => {
  const { paymentIntentId, amount, reason } = req.body;

  const result = await refunds.createRefund(
    paymentIntentId,
    amount,   // e.g. 500 = $5.00
    reason    // "duplicate" | "fraudulent" | "requested_by_customer"
  );

  res.json({
    refundId: result.id,
    amount: result.amount,
    currency: result.currency,
    status: result.status,
  });
});
```

## Check refund status
```typescript
app.get("/api/refund/:id", async (req, res) => {
  const status = await refunds.getRefundStatus(req.params.id);
  res.json({
    refundId: status.id,
    status: status.status,
    amount: status.amount,
  });
});
```

## Event-driven refund notifications
```typescript
refunds.on("onRefundCompleted", async ({ refundId, paymentIntentId, amount, currency }) => {
  const amountFormatted = (amount / 100).toFixed(2);
  await emailService.send({
    to: await getCustomerEmail(paymentIntentId),
    subject: "Your refund has been processed",
    html: `<p>Refund of ${currency.toUpperCase()} ${amountFormatted} has been issued.</p>`,
  });

  await db.refunds.create({ refundId, paymentIntentId, amount, currency, status: "completed" });
});

refunds.on("onRefundFailed", async ({ refundId, paymentIntentId, reason }) => {
  await slackBot.sendMessage("#ops-alerts", `Refund ${refundId} failed: ${reason}`);
});
```

## Webhook handler with error handling
```typescript
app.post("/webhooks/stripe",
  express.raw({ type: "application/json" }),
  (req, res) => {
    try {
      const event = refunds.handleWebhook(
        req.body.toString(),
        req.headers["stripe-signature"]!
      );
      console.log("Refund webhook:", event.type);
      res.sendStatus(200);
    } catch (err) {
      console.error("Webhook verification failed:", err.message);
      res.sendStatus(400);
    }
  }
);
```

## List all refunds for a payment
```typescript
const allRefunds = await refunds.listRefunds("pi_3abc123");
const totalRefunded = allRefunds.reduce((sum, r) => sum + r.amount, 0);
console.log(`Total refunded: ${totalRefunded} cents`);
```

---

## Python Examples

### Full refund (Flask)
```python
import os
from flask import Flask, request, jsonify
from payment_refund import PaymentRefund

app = Flask(__name__)
refunds = PaymentRefund(
    secret_key=os.environ["STRIPE_SECRET_KEY"],
    webhook_secret=os.environ["STRIPE_WEBHOOK_SECRET"],
)

@app.route("/api/refund", methods=["POST"])
def create_refund():
    data = request.json
    result = refunds.create_refund(
        data["payment_intent_id"],
        amount=data.get("amount"),
        reason=data.get("reason"),
    )
    return jsonify(refund_id=result.id, status=result.status, amount=result.amount)
```

### Partial refund
```python
# Refund $5.00 of a charge
result = refunds.create_refund("pi_3abc123", amount=500, reason="requested_by_customer")
print(f"Refund {result.id}: {result.status}")
```

### Webhook handler (Flask)
```python
@app.route("/webhooks/stripe", methods=["POST"])
def webhook():
    try:
        event = refunds.handle_webhook(request.data, request.headers["Stripe-Signature"])
        print(f"Webhook event: {event.type}")
        return "", 200
    except Exception as e:
        print(f"Webhook error: {e}")
        return str(e), 400
```

### Event listeners
```python
refunds.on("onRefundCompleted", lambda e: print(
    f"Refund {e['refundId']}: {e['amount']} {e['currency']}"
))
refunds.on("onRefundFailed", lambda e: send_alert(f"Refund failed: {e['reason']}"))
```
