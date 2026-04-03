# @radzor/stripe-checkout — Stripe payment integration (stdlib only, raw HTTP)

from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from typing import Any, Callable, Literal
from urllib.parse import urlencode
from urllib.request import Request, urlopen

STRIPE_API = "https://api.stripe.com/v1"


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
        self._secret_key = config.secret_key
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
        params = {
            "mode": self._config.mode,
            "line_items[0][price]": self._config.price_id,
            "line_items[0][quantity]": str(self._config.quantity),
            "success_url": self._config.success_url,
            "cancel_url": self._config.cancel_url,
        }
        if customer_email:
            params["customer_email"] = customer_email

        data = self._api_call("POST", "/checkout/sessions", params)
        return CheckoutSession(
            id=data["id"],
            url=data.get("url", ""),
            status=data.get("status", ""),
        )

    def get_payment_status(self, session_id: str) -> str:
        data = self._api_call("GET", f"/checkout/sessions/{session_id}")
        return data["payment_status"]

    def cancel_subscription(self, subscription_id: str) -> None:
        self._api_call("POST", f"/subscriptions/{subscription_id}", {
            "cancel_at_period_end": "true",
        })
        self._emit("onSubscriptionCanceled", {"subscriptionId": subscription_id})

    def create_refund(self, payment_intent_id: str, amount: int | None = None) -> dict[str, str]:
        params: dict[str, str] = {"payment_intent": payment_intent_id}
        if amount is not None:
            params["amount"] = str(amount)
        data = self._api_call("POST", "/refunds", params)
        return {"id": data["id"], "status": data["status"]}

    def handle_webhook(self, payload: str | bytes, signature: str) -> WebhookEvent:
        if isinstance(payload, bytes):
            payload = payload.decode("utf-8")

        # Parse Stripe-Signature header
        parts: dict[str, str] = {}
        signatures: list[str] = []
        for item in signature.split(","):
            key, _, val = item.partition("=")
            if key.strip() == "t":
                parts["timestamp"] = val.strip()
            elif key.strip() == "v1":
                signatures.append(val.strip())

        if "timestamp" not in parts or not signatures:
            raise ValueError("Invalid Stripe signature header")

        # Compute expected signature
        signed_payload = f"{parts['timestamp']}.{payload}"
        expected = hmac.new(
            self._webhook_secret.encode(),
            signed_payload.encode(),
            hashlib.sha256,
        ).hexdigest()

        # Timing-safe comparison
        if not any(hmac.compare_digest(expected, sig) for sig in signatures):
            raise ValueError("Webhook signature verification failed")

        # Check timestamp tolerance (5 minutes)
        ts = int(parts["timestamp"])
        if abs(int(time.time()) - ts) > 300:
            raise ValueError("Webhook timestamp too old")

        event = json.loads(payload)
        obj = event.get("data", {}).get("object", {})

        if event["type"] == "checkout.session.completed":
            customer = obj.get("customer", "")
            self._emit("onPaymentSuccess", {
                "sessionId": obj.get("id", ""),
                "customerId": customer if isinstance(customer, str) else customer.get("id", ""),
                "amount": obj.get("amount_total", 0),
            })
        elif event["type"] == "checkout.session.expired":
            self._emit("onPaymentFailed", {
                "sessionId": obj.get("id", ""),
                "error": "Checkout session expired",
            })
        elif event["type"] == "customer.subscription.created":
            customer = obj.get("customer", "")
            items = obj.get("items", {}).get("data", [])
            price_id = items[0]["price"]["id"] if items else ""
            self._emit("onSubscriptionCreated", {
                "subscriptionId": obj.get("id", ""),
                "customerId": customer if isinstance(customer, str) else customer.get("id", ""),
                "priceId": price_id,
            })
        elif event["type"] == "customer.subscription.deleted":
            self._emit("onSubscriptionCanceled", {"subscriptionId": obj.get("id", "")})

        return WebhookEvent(type=event["type"], data=obj)

    def _api_call(self, method: str, path: str, params: dict[str, str] | None = None) -> Any:
        import base64
        auth = base64.b64encode(f"{self._secret_key}:".encode()).decode()

        url = f"{STRIPE_API}{path}"
        data = urlencode(params).encode() if params and method != "GET" else None
        if params and method == "GET":
            url = f"{url}?{urlencode(params)}"

        req = Request(url, data=data, headers={
            "Authorization": f"Basic {auth}",
            "Content-Type": "application/x-www-form-urlencoded",
        }, method=method)

        with urlopen(req) as resp:
            result = json.loads(resp.read().decode())

        if "error" in result:
            raise Exception(f"Stripe API error: {result['error']['message']}")

        return result
