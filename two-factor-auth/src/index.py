# @radzor/two-factor-auth — TOTP 2FA (RFC 6238)

from __future__ import annotations

import hashlib
import hmac
import os
import struct
import time
from dataclasses import dataclass
from typing import Any, Callable
from urllib.parse import quote

BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"


def _base32_encode(data: bytes) -> str:
    bits = "".join(format(b, "08b") for b in data)
    result = []
    for i in range(0, len(bits), 5):
        chunk = bits[i : i + 5].ljust(5, "0")
        result.append(BASE32_CHARS[int(chunk, 2)])
    return "".join(result)


def _base32_decode(encoded: str) -> bytes:
    bits = []
    for char in encoded.upper():
        idx = BASE32_CHARS.find(char)
        if idx == -1:
            continue
        bits.append(format(idx, "05b"))
    all_bits = "".join(bits)
    result = []
    for i in range(0, len(all_bits) - 7, 8):
        result.append(int(all_bits[i : i + 8], 2))
    return bytes(result)


@dataclass
class TwoFactorConfig:
    issuer: str
    digits: int = 6
    period: int = 30


@dataclass
class TotpSecret:
    base32: str
    hex: str
    otpauth_uri: str


class TwoFactorAuth:
    def __init__(self, config: TwoFactorConfig) -> None:
        self._issuer = config.issuer
        self._digits = config.digits
        self._period = config.period
        self._listeners: dict[str, list[Callable]] = {}

    def on(self, event: str, listener: Callable) -> None:
        self._listeners.setdefault(event, []).append(listener)

    def off(self, event: str, listener: Callable) -> None:
        self._listeners[event] = [l for l in self._listeners.get(event, []) if l is not listener]

    def _emit(self, event: str, payload: Any) -> None:
        for listener in self._listeners.get(event, []):
            listener(payload)

    def generate_secret(self, account_name: str) -> TotpSecret:
        secret_bytes = os.urandom(20)
        base32_secret = _base32_encode(secret_bytes)
        hex_secret = secret_bytes.hex()

        uri = (
            f"otpauth://totp/{quote(self._issuer)}:{quote(account_name)}"
            f"?secret={base32_secret}&issuer={quote(self._issuer)}"
            f"&algorithm=SHA1&digits={self._digits}&period={self._period}"
        )

        return TotpSecret(base32=base32_secret, hex=hex_secret, otpauth_uri=uri)

    def generate_qr_uri(self, account_name: str, secret: str) -> str:
        return (
            f"otpauth://totp/{quote(self._issuer)}:{quote(account_name)}"
            f"?secret={secret}&issuer={quote(self._issuer)}"
            f"&algorithm=SHA1&digits={self._digits}&period={self._period}"
        )

    def verify_token(self, token: str, secret: str, window: int = 1) -> bool:
        try:
            secret_bytes = _base32_decode(secret)
            now = int(time.time())

            for i in range(-window, window + 1):
                time_step = now // self._period + i
                generated = self._generate_totp(secret_bytes, time_step)
                if generated == token:
                    self._emit("onVerified", {"valid": True, "token": token})
                    return True

            self._emit("onVerified", {"valid": False, "token": token})
            return False
        except Exception as e:
            self._emit("onError", {"code": "VERIFY_ERROR", "message": str(e)})
            raise

    def _generate_totp(self, secret: bytes, time_step: int) -> str:
        time_bytes = struct.pack(">Q", time_step)
        h = hmac.new(secret, time_bytes, hashlib.sha1).digest()
        offset = h[-1] & 0x0F
        code = (
            ((h[offset] & 0x7F) << 24)
            | ((h[offset + 1] & 0xFF) << 16)
            | ((h[offset + 2] & 0xFF) << 8)
            | (h[offset + 3] & 0xFF)
        )
        return str(code % (10 ** self._digits)).zfill(self._digits)
