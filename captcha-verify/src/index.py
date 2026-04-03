# @radzor/captcha-verify — Server-side CAPTCHA verification

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Callable, Literal
from urllib.parse import urlencode
from urllib.request import Request, urlopen


Provider = Literal["turnstile", "recaptcha", "hcaptcha"]

_VERIFY_URLS: dict[str, str] = {
    "turnstile": "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    "recaptcha": "https://www.google.com/recaptcha/api/siteverify",
    "hcaptcha": "https://api.hcaptcha.com/siteverify",
}


@dataclass
class CaptchaVerifyConfig:
    provider: Provider
    secret_key: str
    score_threshold: float = 0.5


@dataclass
class CaptchaResult:
    success: bool
    provider: Provider
    score: float | None = None
    hostname: str | None = None
    error_codes: list[str] | None = None


class CaptchaVerify:
    def __init__(self, config: CaptchaVerifyConfig) -> None:
        self._config = config
        self._listeners: dict[str, list[Callable]] = {}

    def on(self, event: str, listener: Callable) -> None:
        self._listeners.setdefault(event, []).append(listener)

    def off(self, event: str, listener: Callable) -> None:
        self._listeners[event] = [l for l in self._listeners.get(event, []) if l is not listener]

    def _emit(self, event: str, payload: Any) -> None:
        for listener in self._listeners.get(event, []):
            listener(payload)

    def verify(self, token: str, remote_ip: str | None = None) -> CaptchaResult:
        """Verify a CAPTCHA token."""
        try:
            url = _VERIFY_URLS[self._config.provider]
            params: dict[str, str] = {
                "secret": self._config.secret_key,
                "response": token,
            }
            if remote_ip:
                params["remoteip"] = remote_ip

            data = urlencode(params).encode()
            req = Request(url, data=data, headers={
                "Content-Type": "application/x-www-form-urlencoded",
            }, method="POST")

            with urlopen(req) as resp:
                result_data = json.loads(resp.read().decode())

            success = result_data.get("success", False)
            score = result_data.get("score")

            # reCAPTCHA v3: check score threshold
            if self._config.provider == "recaptcha" and score is not None:
                success = success and score >= self._config.score_threshold

            result = CaptchaResult(
                success=success,
                provider=self._config.provider,
                score=score,
                hostname=result_data.get("hostname"),
                error_codes=result_data.get("error-codes"),
            )
            self._emit("onVerified", {"success": result.success, "score": score or -1})
            return result

        except Exception as e:
            self._emit("onError", {"code": "VERIFY_FAILED", "message": str(e)})
            raise
