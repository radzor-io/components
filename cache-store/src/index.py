# @radzor/cache-store — In-memory cache with TTL and LRU eviction

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any, Callable, TypeVar

T = TypeVar("T")


@dataclass
class CacheEntry:
    value: Any
    expires_at: float  # 0 = no expiry
    last_accessed: float


@dataclass
class CacheStats:
    size: int
    hits: int
    misses: int
    evictions: int


class CacheStore:
    def __init__(self, max_size: int = 1000, default_ttl: float = 0) -> None:
        self._store: dict[str, CacheEntry] = {}
        self._max_size = max_size
        self._default_ttl = default_ttl  # seconds
        self._hits = 0
        self._misses = 0
        self._evictions = 0
        self._listeners: dict[str, list[Callable]] = {}

    def on(self, event: str, listener: Callable) -> None:
        self._listeners.setdefault(event, []).append(listener)

    def off(self, event: str, listener: Callable) -> None:
        self._listeners[event] = [l for l in self._listeners.get(event, []) if l is not listener]

    def _emit(self, event: str, payload: Any) -> None:
        for listener in self._listeners.get(event, []):
            listener(payload)

    def get(self, key: str) -> Any | None:
        entry = self._store.get(key)

        if entry is None:
            self._misses += 1
            self._emit("onMiss", {"key": key})
            return None

        if entry.expires_at > 0 and time.time() > entry.expires_at:
            del self._store[key]
            self._misses += 1
            self._evictions += 1
            self._emit("onEvicted", {"key": key, "reason": "ttl"})
            self._emit("onMiss", {"key": key})
            return None

        entry.last_accessed = time.time()
        self._hits += 1
        self._emit("onHit", {"key": key})
        return entry.value

    def set(self, key: str, value: Any, ttl: float | None = None) -> None:
        effective_ttl = ttl if ttl is not None else self._default_ttl

        if len(self._store) >= self._max_size and key not in self._store:
            self._evict_lru()

        self._store[key] = CacheEntry(
            value=value,
            expires_at=time.time() + effective_ttl if effective_ttl > 0 else 0,
            last_accessed=time.time(),
        )

    def delete(self, key: str) -> bool:
        if key in self._store:
            del self._store[key]
            self._emit("onEvicted", {"key": key, "reason": "manual"})
            return True
        return False

    def has(self, key: str) -> bool:
        entry = self._store.get(key)
        if entry is None:
            return False
        if entry.expires_at > 0 and time.time() > entry.expires_at:
            del self._store[key]
            return False
        return True

    def clear(self) -> None:
        self._store.clear()

    def get_stats(self) -> CacheStats:
        return CacheStats(
            size=len(self._store),
            hits=self._hits,
            misses=self._misses,
            evictions=self._evictions,
        )

    def keys(self) -> list[str]:
        return list(self._store.keys())

    def get_or_set(self, key: str, factory: Callable[[], Any], ttl: float | None = None) -> Any:
        cached = self.get(key)
        if cached is not None:
            return cached
        value = factory()
        self.set(key, value, ttl)
        return value

    def _evict_lru(self) -> None:
        oldest_key: str | None = None
        oldest_time = float("inf")
        now = time.time()

        for key, entry in list(self._store.items()):
            if entry.expires_at > 0 and now > entry.expires_at:
                del self._store[key]
                self._evictions += 1
                self._emit("onEvicted", {"key": key, "reason": "ttl"})
                return

            if entry.last_accessed < oldest_time:
                oldest_key = key
                oldest_time = entry.last_accessed

        if oldest_key:
            del self._store[oldest_key]
            self._evictions += 1
            self._emit("onEvicted", {"key": oldest_key, "reason": "lru"})
