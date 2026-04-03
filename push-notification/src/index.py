# @radzor/push-notification — Push notifications via FCM / APNs

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Callable
from urllib.request import Request, urlopen


@dataclass
class FcmCredentials:
    server_key: str


@dataclass
class ApnsCredentials:
    key_id: str
    team_id: str
    private_key: str
    bundle_id: str
    production: bool = False


@dataclass
class PushPayload:
    title: str
    body: str
    data: dict[str, str] | None = None
    badge: int | None = None
    sound: str | None = None


@dataclass
class PushResult:
    success: bool
    message_id: str | None = None
    error: str | None = None


class PushNotification:
    def __init__(self, provider: str, credentials: FcmCredentials | ApnsCredentials) -> None:
        self._provider = provider
        self._credentials = credentials
        self._listeners: dict[str, list[Callable]] = {}

    def on(self, event: str, listener: Callable) -> None:
        self._listeners.setdefault(event, []).append(listener)

    def off(self, event: str, listener: Callable) -> None:
        self._listeners[event] = [l for l in self._listeners.get(event, []) if l is not listener]

    def _emit(self, event: str, payload: Any) -> None:
        for listener in self._listeners.get(event, []):
            listener(payload)

    def send_to_device(self, device_token: str, payload: PushPayload) -> PushResult:
        if self._provider == "fcm":
            return self._send_fcm(device_token, payload)
        return self._send_apns(device_token, payload)

    def send_to_topic(self, topic: str, payload: PushPayload) -> PushResult:
        if self._provider != "fcm":
            raise ValueError("send_to_topic is only supported with FCM")
        return self._send_fcm(f"/topics/{topic}", payload)

    def _send_fcm(self, to: str, payload: PushPayload) -> PushResult:
        creds = self._credentials
        if not isinstance(creds, FcmCredentials):
            raise TypeError("FCM credentials required")

        try:
            body = json.dumps({
                "to": to,
                "notification": {
                    "title": payload.title,
                    "body": payload.body,
                    "sound": payload.sound or "default",
                },
                "data": payload.data,
            }).encode()

            req = Request("https://fcm.googleapis.com/fcm/send", data=body, headers={
                "Content-Type": "application/json",
                "Authorization": f"key={creds.server_key}",
            })

            with urlopen(req) as resp:
                data = json.loads(resp.read().decode())

            result = PushResult(
                success=data.get("success", 0) == 1,
                message_id=data.get("results", [{}])[0].get("message_id"),
                error=data.get("results", [{}])[0].get("error"),
            )
            self._emit("onSent", result)
            return result
        except Exception as e:
            self._emit("onError", {"code": "FCM_ERROR", "message": str(e)})
            raise

    def _send_apns(self, device_token: str, payload: PushPayload) -> PushResult:
        creds = self._credentials
        if not isinstance(creds, ApnsCredentials):
            raise TypeError("APNs credentials required")

        host = "api.push.apple.com" if creds.production else "api.sandbox.push.apple.com"

        try:
            apns_payload: dict[str, Any] = {
                "aps": {
                    "alert": {"title": payload.title, "body": payload.body},
                    "sound": payload.sound or "default",
                },
            }
            if payload.badge is not None:
                apns_payload["aps"]["badge"] = payload.badge
            if payload.data:
                apns_payload.update(payload.data)

            body = json.dumps(apns_payload).encode()
            req = Request(f"https://{host}/3/device/{device_token}", data=body, headers={
                "Content-Type": "application/json",
                "apns-topic": creds.bundle_id,
                "apns-push-type": "alert",
            })

            with urlopen(req) as resp:
                result = PushResult(success=resp.status == 200)

            self._emit("onSent", result)
            return result
        except Exception as e:
            self._emit("onError", {"code": "APNS_ERROR", "message": str(e)})
            raise
