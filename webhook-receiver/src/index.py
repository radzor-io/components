# @radzor/webhook-receiver — Secure webhook verification

from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from typing import Any, Callable, Literal


Algorithm = Literal["sha256", "sha1", "sha512"]


@dataclass
class WebhookReceiverConfig:
    secret: str
    algorithm: Algorithm = "sha256"
    signature_header: str = "x-signature-256"
    tolerance: int = 300
    timestamp_header: str = ""


@dataclass
class WebhookPayload:
    event_type: str
    data: Any
    timestamp: int
    raw: str


_HASH_MAP = {
    "sha256": hashlib.sha256,
    "sha1": hashlib.sha1,
    "sha512": hashlib.sha512,
}


class WebhookReceiver:
    def __init__(self, config: WebhookReceiverConfig) -> None:
        self._config = config
        self._listeners: dict[str, list[Callable]] = {}

    def on(self, event: str, listener: Callable) -> None:
        self._listeners.setdefault(event, []).append(listener)

    def off(self, event: str, listener: Callable) -> None:
        self._listeners[event] = [l for l in self._listeners.get(event, []) if l is not listener]

    def _emit(self, event: str, payload: Any) -> None:
        for listener in self._listeners.get(event, []):
            listener(payload)

    def verify(self, payload: str | bytes, signature: str, timestamp: str | None = None) -> WebhookPayload:
        """Verify a webhook signature and parse the payload."""
        body = payload if isinstance(payload, str) else payload.decode("utf-8")

        # Replay protection
        if timestamp and self._config.tolerance > 0:
            ts = int(timestamp)
            age = abs(int(time.time()) - ts)
            if age > self._config.tolerance:
                self._emit("onRejected", {"reason": "Timestamp too old", "code": "REPLAY_DETECTED"})
                raise ValueError("Webhook timestamp outside tolerance window")

        # Compute expected signature
        sign_body = f"{timestamp}.{body}" if timestamp else body
        hash_fn = _HASH_MAP[self._config.algorithm]
        expected = hmac.new(self._config.secret.encode(), sign_body.encode(), hash_fn).hexdigest()

        # Strip prefix
        sig = signature
        for prefix in ("sha256=", "sha1=", "sha512="):
            if sig.startswith(prefix):
                sig = sig[len(prefix):]
                break

        # Timing-safe comparison
        if not hmac.compare_digest(expected, sig):
            self._emit("onRejected", {"reason": "Invalid signature", "code": "INVALID_SIGNATURE"})
            raise ValueError("Webhook signature verification failed")

        parsed = json.loads(body)
        result = WebhookPayload(
            event_type=parsed.get("type") or parsed.get("event") or parsed.get("event_type") or "unknown",
            data=parsed.get("data", parsed),
            timestamp=int(timestamp) if timestamp else int(time.time()),
            raw=body,
        )
        self._emit("onVerified", {"eventType": result.event_type, "timestamp": result.timestamp})
        return result

    def verify_stripe(self, payload: str, signature_header: str) -> WebhookPayload:
        """Verify a Stripe webhook using their specific signing scheme."""
        parts = dict(p.split("=", 1) for p in signature_header.split(","))
        timestamp = parts.get("t")
        sig = parts.get("v1")

        if not timestamp or not sig:
            self._emit("onRejected", {"reason": "Missing Stripe signature parts", "code": "INVALID_FORMAT"})
            raise ValueError("Invalid Stripe-Signature header format")

        # Replay protection
        if self._config.tolerance > 0:
            age = abs(int(time.time()) - int(timestamp))
            if age > self._config.tolerance:
                self._emit("onRejected", {"reason": "Timestamp too old", "code": "REPLAY_DETECTED"})
                raise ValueError("Stripe webhook timestamp outside tolerance")

        expected = hmac.new(
            self._config.secret.encode(),
            f"{timestamp}.{payload}".encode(),
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(expected, sig):
            self._emit("onRejected", {"reason": "Invalid Stripe signature", "code": "INVALID_SIGNATURE"})
            raise ValueError("Stripe webhook signature verification failed")

        parsed = json.loads(payload)
        result = WebhookPayload(
            event_type=parsed["type"],
            data=parsed.get("data", {}).get("object", parsed.get("data")),
            timestamp=int(timestamp),
            raw=payload,
        )
        self._emit("onVerified", {"eventType": result.event_type, "timestamp": result.timestamp})
        return result
