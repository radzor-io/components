# @radzor/subscription-billing — Usage Examples

## Create a subscription with trial (Express)
```typescript
import { SubscriptionBilling } from "@radzor/subscription-billing";

const billing = new SubscriptionBilling({
  secretKey: process.env.STRIPE_SECRET_KEY!,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
});

app.post("/api/subscribe", async (req, res) => {
  const { customerId, priceId } = req.body;
  const sub = await billing.createSubscription(customerId, priceId, 14);
  res.json({
    subscriptionId: sub.id,
    status: sub.status,
    trialEnd: new Date(sub.currentPeriodEnd * 1000),
  });
});
```

## Upgrade/downgrade a plan
```typescript
app.post("/api/change-plan", async (req, res) => {
  const { subscriptionId, newPriceId } = req.body;
  const updated = await billing.updateSubscription(subscriptionId, newPriceId);
  res.json({
    subscriptionId: updated.id,
    newPlan: updated.priceId,
    status: updated.status,
  });
});
```

## Cancel at period end
```typescript
app.post("/api/cancel", async (req, res) => {
  const sub = await billing.cancelSubscription(req.body.subscriptionId);
  res.json({
    message: "Subscription will cancel at period end",
    cancelAt: new Date(sub.currentPeriodEnd * 1000),
  });
});
```

## Immediate cancellation
```typescript
app.post("/api/cancel-now", async (req, res) => {
  const sub = await billing.cancelSubscription(req.body.subscriptionId, true);
  res.json({ message: "Subscription cancelled immediately", status: sub.status });
});
```

## List active subscriptions
```typescript
app.get("/api/subscriptions/:customerId", async (req, res) => {
  const subs = await billing.listSubscriptions(req.params.customerId, "active");
  res.json(subs.map(s => ({
    id: s.id,
    plan: s.priceId,
    status: s.status,
    renewsAt: new Date(s.currentPeriodEnd * 1000),
  })));
});
```

## Webhook handling with event-driven logic
```typescript
billing.on("onSubscriptionCreated", async ({ subscriptionId, customerId, priceId }) => {
  await db.users.update({ stripeCustomerId: customerId }, { plan: priceId, active: true });
  await emailService.send(customerId, "welcome-email");
});

billing.on("onPaymentFailed", async ({ customerId, attemptCount }) => {
  if (attemptCount >= 3) {
    await db.users.update({ stripeCustomerId: customerId }, { active: false });
    await emailService.send(customerId, "payment-failed-final");
  } else {
    await emailService.send(customerId, "payment-failed-retry");
  }
});

billing.on("onSubscriptionCancelled", async ({ customerId }) => {
  await db.users.update({ stripeCustomerId: customerId }, { active: false });
});

app.post("/webhooks/stripe", express.raw({ type: "application/json" }), (req, res) => {
  billing.handleWebhook(req.body.toString(), req.headers["stripe-signature"]!);
  res.sendStatus(200);
});
```

---

## Python Examples

### Create a subscription (FastAPI)
```python
import os
from fastapi import FastAPI, Request
from subscription_billing import SubscriptionBilling

app = FastAPI()
billing = SubscriptionBilling(
    secret_key=os.environ["STRIPE_SECRET_KEY"],
    webhook_secret=os.environ["STRIPE_WEBHOOK_SECRET"],
)

@app.post("/api/subscribe")
async def subscribe(customer_id: str, price_id: str):
    sub = billing.create_subscription(customer_id, price_id, trial_days=14)
    return {"subscription_id": sub.id, "status": sub.status}
```

### Cancel subscription (Flask)
```python
@app.route("/api/cancel", methods=["POST"])
def cancel():
    sub = billing.cancel_subscription(request.json["subscription_id"])
    return {"message": "Cancelled at period end"}
```

### Webhook handler (Flask)
```python
@app.route("/webhooks/stripe", methods=["POST"])
def webhook():
    billing.handle_webhook(request.data, request.headers["Stripe-Signature"])
    return "", 200
```

### Event listeners
```python
billing.on("onPaymentFailed", lambda e: send_alert(
    f"Payment failed for {e['customerId']} (attempt {e['attemptCount']})"
))
```
