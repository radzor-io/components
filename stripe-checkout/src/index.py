# @radzor/stripe-checkout — Stripe payment integration (uses stripe Python SDK)

from __future__ import annotations

import stripe as _stripe
from dataclasses import dataclass
from typing import Any, Callable, Literal


@dataclass
class StripeCheckoutConfig:
    secret_key: str
    webhook_secret: str
    price_id: str
    success_url: str
    cancel_url: str
    quantity: int = 1
    mode: Literal["payment", "subscription"] = "payment"


@dataclass
class CheckoutSession:
    id: str
    url: str
    status: str


@dataclass
class WebhookEvent:
    type: str
    data: dict[str, Any]


class StripeCheckout:
    def __init__(self, config: StripeCheckoutConfig) -> None:
        self._config = config
        self._stripe = _stripe
        self._stripe.api_key = config.secret_key
        self._webhook_secret = config.webhook_secret
        self._listeners: dict[str, list[Callable]] = {}

    def on(self, event: str, listener: Callable) -> None:
        self._listeners.setdefault(event, []).append(listener)

    def off(self, event: str, listener: Callable) -> None:
        listeners = self._listeners.get(event, [])
        self._listeners[event] = [l for l in listeners if l is not listener]

    def _emit(self, event: str, payload: dict) -> None:
        for listener in self._listeners.get(event, []):
            listener(payload)

    def create_checkout(self, customer_email: str | None = None) -> CheckoutSession:
        """Create a new Stripe Checkout session."""
        params: dict[str, Any] = {
            "mode": self._config.mode,
            "line_items": [{"price": self._config.price_id, "quantity": self._config.quantity}],
            "success_url": self._config.success_url,
            "cancel_url": self._config.cancel_url,
        }
        if customer_email:
            params["customer_email"] = customer_email

        session = self._stripe.checkout.Session.create(**params)
        return CheckoutSession(id=session.id, url=session.url or "", status=session.status or "")

    def get_payment_status(self, session_id: str) -> str:
        """Check the payment status of a checkout session."""
        session = self._stripe.checkout.Session.retrieve(session_id)
        return session.payment_status

    def cancel_subscription(self, subscription_id: str) -> None:
        """Cancel a subscription at end of current billing period."""
        self._stripe.Subscription.modify(subscription_id, cancel_at_period_end=True)
        self._emit("onSubscriptionCanceled", {"subscriptionId": subscription_id})

    def handle_webhook(self, payload: str | bytes, signature: str) -> WebhookEvent:
        """Verify and parse a Stripe webhook event."""
        event = self._stripe.Webhook.construct_event(payload, signature, self._webhook_secret)

        if event.type == "checkout.session.completed":
            session = event.data.object
            customer = session.get("customer", "")
            self._emit("onPaymentSuccess", {
                "sessionId": session["id"],
                "customerId": customer if isinstance(customer, str) else customer.get("id", ""),
                "amount": session.get("amount_total", 0),
            })

        elif event.type == "checkout.session.expired":
            session = event.data.object
            self._emit("onPaymentFailed", {
                "sessionId": session["id"],
                "error": "Checkout session expired",
            })

        elif event.type == "customer.subscription.created":
            sub = event.data.object
            customer = sub.get("customer", "")
            items = sub.get("items", {}).get("data", [])
            price_id = items[0]["price"]["id"] if items else ""
            self._emit("onSubscriptionCreated", {
                "subscriptionId": sub["id"],
                "customerId": customer if isinstance(customer, str) else customer.get("id", ""),
                "priceId": price_id,
            })

        elif event.type == "customer.subscription.deleted":
            sub = event.data.object
            self._emit("onSubscriptionCanceled", {"subscriptionId": sub["id"]})

        return WebhookEvent(type=event.type, data=dict(event.data.object))
