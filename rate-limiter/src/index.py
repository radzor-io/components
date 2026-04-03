# @radzor/rate-limiter — In-memory rate limiting with token bucket and sliding window algorithms

from __future__ import annotations

import math
import threading
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Callable, Literal


class Algorithm(str, Enum):
    TOKEN_BUCKET = "token-bucket"
    SLIDING_WINDOW = "sliding-window"


@dataclass
class RateLimiterConfig:
    algorithm: Literal["token-bucket", "sliding-window"]
    max_requests: int
    window_ms: int
    key_prefix: str = ""


@dataclass
class RateLimitResult:
    allowed: bool
    remaining: int
    reset_at: float
    retry_after_ms: float


@dataclass
class _TokenBucketEntry:
    tokens: float
    last_refill: float


@dataclass
class _SlidingWindowEntry:
    timestamps: list[float] = field(default_factory=list)


class RateLimiter:
    def __init__(self, config: RateLimiterConfig) -> None:
        if config.max_requests <= 0:
            raise ValueError("max_requests must be greater than 0")
        if config.window_ms <= 0:
            raise ValueError("window_ms must be greater than 0")

        self._config = config
        self._listeners: dict[str, list[Callable]] = {}
        self._token_buckets: dict[str, _TokenBucketEntry] = {}
        self._sliding_windows: dict[str, _SlidingWindowEntry] = {}
        self._lock = threading.Lock()

        # Periodic cleanup to prevent memory leaks
        self._cleanup_timer: threading.Timer | None = None
        self._schedule_cleanup()

    # ─── Events ─────────────────────────────────────────────

    def on(self, event: str, listener: Callable) -> None:
        self._listeners.setdefault(event, []).append(listener)

    def _emit(self, event: str, payload: dict) -> None:
        for listener in self._listeners.get(event, []):
            listener(payload)

    # ─── Public API ─────────────────────────────────────────

    def check(self, key: str) -> RateLimitResult:
        full_key = f"{self._config.key_prefix}:{key}" if self._config.key_prefix else key
        with self._lock:
            if self._config.algorithm == "token-bucket":
                return self._check_token_bucket(full_key)
            return self._check_sliding_window(full_key)

    def consume(self, key: str) -> RateLimitResult:
        full_key = f"{self._config.key_prefix}:{key}" if self._config.key_prefix else key
        with self._lock:
            if self._config.algorithm == "token-bucket":
                result = self._consume_token_bucket(full_key)
            else:
                result = self._consume_sliding_window(full_key)

        if result.allowed:
            self._emit("onAllowed", {"key": full_key, "remaining": result.remaining})
        else:
            self._emit("onBlocked", {
                "code": "RATE_LIMITED",
                "message": f'Rate limit exceeded for key "{key}". Retry after {result.retry_after_ms}ms.',
                "key": full_key,
                "retryAfterMs": result.retry_after_ms,
            })

        return result

    def reset(self, key: str) -> None:
        full_key = f"{self._config.key_prefix}:{key}" if self._config.key_prefix else key
        with self._lock:
            self._token_buckets.pop(full_key, None)
            self._sliding_windows.pop(full_key, None)

    def get_headers(self, result: RateLimitResult) -> dict[str, str]:
        headers = {
            "X-RateLimit-Limit": str(self._config.max_requests),
            "X-RateLimit-Remaining": str(result.remaining),
            "X-RateLimit-Reset": str(math.ceil(result.reset_at / 1000)),
        }
        if not result.allowed:
            headers["Retry-After"] = str(math.ceil(result.retry_after_ms / 1000))
        return headers

    def destroy(self) -> None:
        if self._cleanup_timer:
            self._cleanup_timer.cancel()
            self._cleanup_timer = None
        with self._lock:
            self._token_buckets.clear()
            self._sliding_windows.clear()

    # ─── Token Bucket ───────────────────────────────────────

    def _get_or_create_bucket(self, key: str) -> _TokenBucketEntry:
        entry = self._token_buckets.get(key)
        if entry is None:
            entry = _TokenBucketEntry(tokens=self._config.max_requests, last_refill=time.time() * 1000)
            self._token_buckets[key] = entry
        return entry

    def _refill_bucket(self, entry: _TokenBucketEntry) -> None:
        now = time.time() * 1000
        elapsed = now - entry.last_refill
        refill_rate = self._config.max_requests / self._config.window_ms
        entry.tokens = min(self._config.max_requests, entry.tokens + elapsed * refill_rate)
        entry.last_refill = now

    def _time_to_next_token(self, entry: _TokenBucketEntry) -> float:
        refill_rate = self._config.max_requests / self._config.window_ms
        return math.ceil((1 - entry.tokens) / refill_rate)

    def _check_token_bucket(self, key: str) -> RateLimitResult:
        entry = self._get_or_create_bucket(key)
        self._refill_bucket(entry)
        return RateLimitResult(
            allowed=entry.tokens > 0,
            remaining=max(0, int(entry.tokens)),
            reset_at=entry.last_refill + self._config.window_ms,
            retry_after_ms=0 if entry.tokens > 0 else self._time_to_next_token(entry),
        )

    def _consume_token_bucket(self, key: str) -> RateLimitResult:
        entry = self._get_or_create_bucket(key)
        self._refill_bucket(entry)
        if entry.tokens >= 1:
            entry.tokens -= 1
            return RateLimitResult(
                allowed=True,
                remaining=max(0, int(entry.tokens)),
                reset_at=entry.last_refill + self._config.window_ms,
                retry_after_ms=0,
            )
        return RateLimitResult(
            allowed=False,
            remaining=0,
            reset_at=entry.last_refill + self._config.window_ms,
            retry_after_ms=self._time_to_next_token(entry),
        )

    # ─── Sliding Window ─────────────────────────────────────

    def _get_or_create_window(self, key: str) -> _SlidingWindowEntry:
        entry = self._sliding_windows.get(key)
        if entry is None:
            entry = _SlidingWindowEntry()
            self._sliding_windows[key] = entry
        return entry

    def _prune_window(self, entry: _SlidingWindowEntry) -> None:
        cutoff = time.time() * 1000 - self._config.window_ms
        while entry.timestamps and entry.timestamps[0] <= cutoff:
            entry.timestamps.pop(0)

    def _check_sliding_window(self, key: str) -> RateLimitResult:
        entry = self._get_or_create_window(key)
        self._prune_window(entry)
        remaining = max(0, self._config.max_requests - len(entry.timestamps))
        now = time.time() * 1000
        oldest = entry.timestamps[0] if entry.timestamps else None
        reset_at = (oldest + self._config.window_ms) if oldest else (now + self._config.window_ms)
        retry_after_ms = 0 if remaining > 0 else max(0, (oldest + self._config.window_ms - now) if oldest else 0)
        return RateLimitResult(allowed=remaining > 0, remaining=remaining, reset_at=reset_at, retry_after_ms=retry_after_ms)

    def _consume_sliding_window(self, key: str) -> RateLimitResult:
        entry = self._get_or_create_window(key)
        self._prune_window(entry)
        now = time.time() * 1000
        if len(entry.timestamps) < self._config.max_requests:
            entry.timestamps.append(now)
            return RateLimitResult(
                allowed=True,
                remaining=self._config.max_requests - len(entry.timestamps),
                reset_at=entry.timestamps[0] + self._config.window_ms,
                retry_after_ms=0,
            )
        oldest = entry.timestamps[0]
        return RateLimitResult(
            allowed=False,
            remaining=0,
            reset_at=oldest + self._config.window_ms,
            retry_after_ms=max(0, oldest + self._config.window_ms - now),
        )

    # ─── Cleanup ────────────────────────────────────────────

    def _schedule_cleanup(self) -> None:
        interval = self._config.window_ms * 2 / 1000
        self._cleanup_timer = threading.Timer(interval, self._run_cleanup)
        self._cleanup_timer.daemon = True
        self._cleanup_timer.start()

    def _run_cleanup(self) -> None:
        now = time.time() * 1000
        with self._lock:
            stale_buckets = [
                k for k, v in self._token_buckets.items()
                if now - v.last_refill > self._config.window_ms * 2
            ]
            for k in stale_buckets:
                del self._token_buckets[k]

            stale_windows = [
                k for k, v in self._sliding_windows.items()
                if not v.timestamps or now - v.timestamps[-1] > self._config.window_ms * 2
            ]
            for k in stale_windows:
                del self._sliding_windows[k]

        self._schedule_cleanup()
