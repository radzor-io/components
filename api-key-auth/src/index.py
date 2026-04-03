# @radzor/api-key-auth — API key authentication

from __future__ import annotations

import hashlib
import hmac
import os
from dataclasses import dataclass, field
from typing import Any, Callable


@dataclass
class ApiKey:
    key: str
    hash: str
    prefix: str
    created_at: float
    metadata: dict[str, Any] | None = None


@dataclass
class ValidationResult:
    valid: bool
    key_hash: str | None = None
    metadata: dict[str, Any] | None = None


class ApiKeyAuth:
    def __init__(self, header_name: str = "x-api-key", prefix: str = "rz_") -> None:
        self._header_name = header_name
        self._prefix = prefix
        self._keys: dict[str, ApiKey] = {}  # hash -> ApiKey
        self._revoked: set[str] = set()
        self._listeners: dict[str, list[Callable]] = {}

    def on(self, event: str, listener: Callable) -> None:
        self._listeners.setdefault(event, []).append(listener)

    def off(self, event: str, listener: Callable) -> None:
        self._listeners[event] = [l for l in self._listeners.get(event, []) if l is not listener]

    def _emit(self, event: str, payload: Any) -> None:
        for listener in self._listeners.get(event, []):
            listener(payload)

    def generate_key(self, metadata: dict[str, Any] | None = None) -> ApiKey:
        raw_key = os.urandom(32).hex()
        key = f"{self._prefix}{raw_key}"
        key_hash = self.hash_key(key)

        import time
        api_key = ApiKey(
            key=key,
            hash=key_hash,
            prefix=self._prefix,
            created_at=time.time(),
            metadata=metadata,
        )
        self._keys[key_hash] = api_key
        return api_key

    def hash_key(self, key: str) -> str:
        return hashlib.sha256(key.encode()).hexdigest()

    def validate_key(self, key: str) -> ValidationResult:
        try:
            if not key.startswith(self._prefix):
                result = ValidationResult(valid=False)
                self._emit("onValidated", result)
                return result

            key_hash = self.hash_key(key)

            if key_hash in self._revoked:
                result = ValidationResult(valid=False)
                self._emit("onValidated", result)
                return result

            stored = self._keys.get(key_hash)
            if not stored:
                result = ValidationResult(valid=False)
                self._emit("onValidated", result)
                return result

            # Timing-safe comparison
            valid = hmac.compare_digest(key_hash, stored.hash)

            result = ValidationResult(
                valid=valid,
                key_hash=key_hash,
                metadata=stored.metadata,
            )
            self._emit("onValidated", result)
            return result
        except Exception as e:
            self._emit("onError", {"code": "VALIDATE_ERROR", "message": str(e)})
            raise

    def validate_request(self, headers: dict[str, str]) -> ValidationResult:
        key = headers.get(self._header_name) or headers.get(self._header_name.lower(), "")
        if not key:
            return ValidationResult(valid=False)
        return self.validate_key(key)

    def revoke_key(self, key_or_hash: str) -> None:
        key_hash = self.hash_key(key_or_hash) if key_or_hash.startswith(self._prefix) else key_or_hash
        self._revoked.add(key_hash)
        self._keys.pop(key_hash, None)
        self._emit("onRevoked", {"key_hash": key_hash})

    def get_header_name(self) -> str:
        return self._header_name
