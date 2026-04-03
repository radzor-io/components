# @radzor/embeddings-store — In-memory vector store

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from typing import Any, Callable, Literal
from urllib.request import Request, urlopen


Provider = Literal["openai", "ollama"]


@dataclass
class EmbeddingsStoreConfig:
    provider: Provider
    api_key: str = ""
    model: str | None = None
    base_url: str | None = None


@dataclass
class SearchResult:
    id: str
    text: str
    score: float
    metadata: dict[str, Any]


@dataclass
class StoredDocument:
    id: str
    text: str
    embedding: list[float]
    metadata: dict[str, Any]


_DEFAULTS: dict[str, dict[str, str]] = {
    "openai": {"url": "https://api.openai.com/v1", "model": "text-embedding-3-small"},
    "ollama": {"url": "http://localhost:11434", "model": "nomic-embed-text"},
}


class EmbeddingsStore:
    def __init__(self, config: EmbeddingsStoreConfig) -> None:
        defaults = _DEFAULTS[config.provider]
        self._provider = config.provider
        self._api_key = config.api_key
        self._model = config.model or defaults["model"]
        self._base_url = config.base_url or defaults["url"]
        self._documents: dict[str, StoredDocument] = {}
        self._listeners: dict[str, list[Callable]] = {}

    def on(self, event: str, listener: Callable) -> None:
        self._listeners.setdefault(event, []).append(listener)

    def off(self, event: str, listener: Callable) -> None:
        self._listeners[event] = [l for l in self._listeners.get(event, []) if l is not listener]

    def _emit(self, event: str, payload: Any) -> None:
        for listener in self._listeners.get(event, []):
            listener(payload)

    def add(self, id: str, text: str, metadata: dict[str, Any] | None = None) -> None:
        """Embed text and store in the vector store."""
        try:
            embedding = self._embed(text)
            self._documents[id] = StoredDocument(id=id, text=text, embedding=embedding, metadata=metadata or {})
            self._emit("onStored", {"id": id, "dimensions": len(embedding)})
        except Exception as e:
            self._emit("onError", {"code": "EMBED_FAILED", "message": str(e)})
            raise

    def search(self, query: str, top_k: int = 5) -> list[SearchResult]:
        """Search for similar documents."""
        try:
            query_embedding = self._embed(query)
            results: list[SearchResult] = []
            for doc in self._documents.values():
                score = self._cosine_similarity(query_embedding, doc.embedding)
                results.append(SearchResult(id=doc.id, text=doc.text, score=score, metadata=doc.metadata))
            results.sort(key=lambda r: r.score, reverse=True)
            top_results = results[:top_k]
            self._emit("onSearchComplete", {"query": query, "resultCount": len(top_results)})
            return top_results
        except Exception as e:
            self._emit("onError", {"code": "SEARCH_FAILED", "message": str(e)})
            raise

    def remove(self, id: str) -> None:
        self._documents.pop(id, None)

    def size(self) -> int:
        return len(self._documents)

    # ─── Embedding Providers ────────────────────────────────

    def _embed(self, text: str) -> list[float]:
        if self._provider == "openai":
            return self._embed_openai(text)
        elif self._provider == "ollama":
            return self._embed_ollama(text)
        else:
            raise ValueError(f"Unknown provider: {self._provider}")

    def _embed_openai(self, text: str) -> list[float]:
        body = json.dumps({"model": self._model, "input": text}).encode()
        req = Request(f"{self._base_url}/embeddings", data=body, headers={
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }, method="POST")
        with urlopen(req) as resp:
            data = json.loads(resp.read().decode())
        return data["data"][0]["embedding"]

    def _embed_ollama(self, text: str) -> list[float]:
        body = json.dumps({"model": self._model, "prompt": text}).encode()
        req = Request(f"{self._base_url}/api/embeddings", data=body, headers={
            "Content-Type": "application/json",
        }, method="POST")
        with urlopen(req) as resp:
            data = json.loads(resp.read().decode())
        return data["embedding"]

    # ─── Cosine Similarity ──────────────────────────────────

    def _cosine_similarity(self, a: list[float], b: list[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b))
        mag_a = math.sqrt(sum(x * x for x in a))
        mag_b = math.sqrt(sum(x * x for x in b))
        denom = mag_a * mag_b
        return dot / denom if denom > 0 else 0.0
