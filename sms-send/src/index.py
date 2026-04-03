# @radzor/sms-send — SMS sending via Twilio or Vonage

from __future__ import annotations

import json
from base64 import b64encode
from dataclasses import dataclass
from typing import Any, Callable, Literal
from urllib.parse import urlencode
from urllib.request import Request, urlopen


Provider = Literal["twilio", "vonage"]


@dataclass
class SmsSendConfig:
    provider: Provider
    account_sid: str
    auth_token: str
    from_number: str


@dataclass
class SmsSendResult:
    message_sid: str
    to: str
    status: str
    provider: Provider


class SmsSend:
    def __init__(self, config: SmsSendConfig) -> None:
        self._config = config
        self._listeners: dict[str, list[Callable]] = {}

    def on(self, event: str, listener: Callable) -> None:
        self._listeners.setdefault(event, []).append(listener)

    def off(self, event: str, listener: Callable) -> None:
        self._listeners[event] = [l for l in self._listeners.get(event, []) if l is not listener]

    def _emit(self, event: str, payload: Any) -> None:
        for listener in self._listeners.get(event, []):
            listener(payload)

    def send(self, to: str, body: str) -> SmsSendResult:
        """Send a single SMS message."""
        try:
            if self._config.provider == "twilio":
                return self._send_twilio(to, body)
            elif self._config.provider == "vonage":
                return self._send_vonage(to, body)
            else:
                raise ValueError(f"Unknown provider: {self._config.provider}")
        except Exception as e:
            self._emit("onError", {"code": "SEND_FAILED", "message": str(e), "to": to})
            raise

    def send_batch(self, messages: list[dict[str, str]]) -> list[SmsSendResult]:
        """Send multiple SMS messages."""
        return [self.send(msg["to"], msg["body"]) for msg in messages]

    # ─── Twilio ─────────────────────────────────────────────

    def _send_twilio(self, to: str, body: str) -> SmsSendResult:
        url = f"https://api.twilio.com/2010-04-01/Accounts/{self._config.account_sid}/Messages.json"
        auth = b64encode(f"{self._config.account_sid}:{self._config.auth_token}".encode()).decode()

        data = urlencode({"To": to, "From": self._config.from_number, "Body": body}).encode()

        req = Request(url, data=data, headers={
            "Authorization": f"Basic {auth}",
            "Content-Type": "application/x-www-form-urlencoded",
        }, method="POST")

        with urlopen(req) as resp:
            result_data = json.loads(resp.read().decode())

        result = SmsSendResult(
            message_sid=result_data["sid"],
            to=to,
            status=result_data["status"],
            provider="twilio",
        )
        self._emit("onSent", {"to": to, "messageSid": result_data["sid"]})
        return result

    # ─── Vonage ─────────────────────────────────────────────

    def _send_vonage(self, to: str, body: str) -> SmsSendResult:
        data = json.dumps({
            "api_key": self._config.account_sid,
            "api_secret": self._config.auth_token,
            "from": self._config.from_number,
            "to": to.replace("+", ""),
            "text": body,
        }).encode()

        req = Request("https://rest.nexmo.com/sms/json", data=data, headers={
            "Content-Type": "application/json",
        }, method="POST")

        with urlopen(req) as resp:
            result_data = json.loads(resp.read().decode())

        msg = result_data.get("messages", [{}])[0]
        if msg.get("status") != "0":
            raise RuntimeError(msg.get("error-text", "Vonage send failed"))

        result = SmsSendResult(
            message_sid=msg["message-id"],
            to=to,
            status="sent",
            provider="vonage",
        )
        self._emit("onSent", {"to": to, "messageSid": msg["message-id"]})
        return result
