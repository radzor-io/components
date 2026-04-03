# @radzor/llm-completion — Universal LLM completion client for OpenAI, Anthropic, and Ollama

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from typing import Any, Callable, Generator, Literal
from urllib.request import Request, urlopen
from urllib.error import HTTPError


@dataclass
class LLMCompletionConfig:
    provider: Literal["openai", "anthropic", "ollama"]
    model: str
    api_key: str = ""
    base_url: str = ""
    max_tokens: int = 4096
    temperature: float = 0.7
    system_prompt: str = ""


@dataclass
class ChatMessage:
    role: Literal["system", "user", "assistant"]
    content: str


@dataclass
class CompletionResult:
    content: str
    model: str
    usage: dict[str, int]
    finish_reason: str


@dataclass
class StreamChunk:
    content: str
    done: bool


@dataclass
class LLMError:
    code: str
    message: str
    provider: str
    status: int | None = None


_PROVIDER_DEFAULTS = {
    "openai": "https://api.openai.com/v1",
    "anthropic": "https://api.anthropic.com/v1",
    "ollama": "http://localhost:11434",
}

_MAX_RETRIES = 3
_RETRY_DELAY = 1.0


class LLMCompletion:
    def __init__(self, config: LLMCompletionConfig) -> None:
        if config.provider != "ollama" and not config.api_key:
            raise ValueError(f'API key required for provider "{config.provider}"')

        self._provider = config.provider
        self._api_key = config.api_key
        self._model = config.model
        self._base_url = config.base_url or _PROVIDER_DEFAULTS[config.provider]
        self._max_tokens = config.max_tokens
        self._temperature = config.temperature
        self._system_prompt = config.system_prompt
        self._listeners: dict[str, list[Callable]] = {}
        self._history: list[ChatMessage] = []

        if self._system_prompt:
            self._history.append(ChatMessage(role="system", content=self._system_prompt))

    # ─── Events ─────────────────────────────────────────────

    def on(self, event: str, listener: Callable) -> None:
        self._listeners.setdefault(event, []).append(listener)

    def off(self, event: str, listener: Callable) -> None:
        listeners = self._listeners.get(event, [])
        self._listeners[event] = [l for l in listeners if l is not listener]

    def _emit(self, event: str, payload: Any) -> None:
        for listener in self._listeners.get(event, []):
            listener(payload)

    # ─── Public API ─────────────────────────────────────────

    def complete(self, prompt: str) -> CompletionResult:
        """Send a prompt and get a complete response."""
        self._history.append(ChatMessage(role="user", content=prompt))
        result = self._call_with_retry(lambda: self._call_provider(self._history))
        self._history.append(ChatMessage(role="assistant", content=result.content))
        self._emit("onComplete", result)
        return result

    def stream(self, prompt: str) -> Generator[StreamChunk, None, str]:
        """Send a prompt and yield chunks. Returns full content when done."""
        self._history.append(ChatMessage(role="user", content=prompt))
        full_content = self._call_with_retry(lambda: self._stream_provider(self._history))
        self._history.append(ChatMessage(role="assistant", content=full_content))
        return full_content

    def get_history(self) -> list[ChatMessage]:
        return list(self._history)

    def clear_history(self) -> None:
        self._history = (
            [ChatMessage(role="system", content=self._system_prompt)]
            if self._system_prompt else []
        )

    def set_system_prompt(self, prompt: str) -> None:
        self._system_prompt = prompt
        sys_idx = next((i for i, m in enumerate(self._history) if m.role == "system"), None)
        if sys_idx is not None:
            self._history[sys_idx].content = prompt
        else:
            self._history.insert(0, ChatMessage(role="system", content=prompt))

    # ─── Retry Logic ────────────────────────────────────────

    def _call_with_retry(self, fn: Callable) -> Any:
        last_error = None
        for attempt in range(_MAX_RETRIES):
            try:
                return fn()
            except HTTPError as e:
                last_error = e
                if 400 <= e.code < 500 and e.code != 429:
                    break
                if attempt < _MAX_RETRIES - 1:
                    time.sleep(_RETRY_DELAY * (2 ** attempt))
            except Exception as e:
                last_error = e
                if attempt < _MAX_RETRIES - 1:
                    time.sleep(_RETRY_DELAY * (2 ** attempt))

        error = LLMError(
            code="COMPLETION_FAILED",
            message=str(last_error),
            provider=self._provider,
            status=getattr(last_error, "code", None),
        )
        self._emit("onError", error)
        raise last_error  # type: ignore[misc]

    # ─── Provider Dispatch ──────────────────────────────────

    def _call_provider(self, messages: list[ChatMessage]) -> CompletionResult:
        if self._provider == "openai":
            return self._call_openai(messages)
        elif self._provider == "anthropic":
            return self._call_anthropic(messages)
        else:
            return self._call_ollama(messages)

    def _stream_provider(self, messages: list[ChatMessage]) -> str:
        if self._provider == "openai":
            return self._stream_openai(messages)
        elif self._provider == "anthropic":
            return self._stream_anthropic(messages)
        else:
            return self._stream_ollama(messages)

    # ─── HTTP Helper ────────────────────────────────────────

    def _request(self, url: str, data: dict, headers: dict) -> dict:
        req = Request(
            url,
            data=json.dumps(data).encode("utf-8"),
            headers={"Content-Type": "application/json", **headers},
            method="POST",
        )
        with urlopen(req) as resp:
            return json.loads(resp.read().decode("utf-8"))

    def _request_stream(self, url: str, data: dict, headers: dict) -> Generator[str, None, None]:
        req = Request(
            url,
            data=json.dumps(data).encode("utf-8"),
            headers={"Content-Type": "application/json", **headers},
            method="POST",
        )
        resp = urlopen(req)
        try:
            buffer = ""
            while True:
                chunk = resp.read(4096)
                if not chunk:
                    break
                buffer += chunk.decode("utf-8")
                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    line = line.strip()
                    if line.startswith("data: "):
                        yield line[6:]
                    elif line and not line.startswith(":"):
                        yield line
        finally:
            resp.close()

    # ─── OpenAI ─────────────────────────────────────────────

    def _call_openai(self, messages: list[ChatMessage]) -> CompletionResult:
        data = self._request(
            f"{self._base_url}/chat/completions",
            {
                "model": self._model,
                "messages": [{"role": m.role, "content": m.content} for m in messages],
                "max_tokens": self._max_tokens,
                "temperature": self._temperature,
            },
            {"Authorization": f"Bearer {self._api_key}"},
        )
        return CompletionResult(
            content=data["choices"][0]["message"]["content"] or "",
            model=data["model"],
            usage={
                "promptTokens": data.get("usage", {}).get("prompt_tokens", 0),
                "completionTokens": data.get("usage", {}).get("completion_tokens", 0),
                "totalTokens": data.get("usage", {}).get("total_tokens", 0),
            },
            finish_reason=data["choices"][0].get("finish_reason", "stop"),
        )

    def _stream_openai(self, messages: list[ChatMessage]) -> str:
        full = ""
        for chunk in self._request_stream(
            f"{self._base_url}/chat/completions",
            {
                "model": self._model,
                "messages": [{"role": m.role, "content": m.content} for m in messages],
                "max_tokens": self._max_tokens,
                "temperature": self._temperature,
                "stream": True,
            },
            {"Authorization": f"Bearer {self._api_key}"},
        ):
            if chunk == "[DONE]":
                break
            parsed = json.loads(chunk)
            delta = parsed.get("choices", [{}])[0].get("delta", {}).get("content")
            if delta:
                full += delta
                self._emit("onChunk", StreamChunk(content=delta, done=False))
        self._emit("onChunk", StreamChunk(content="", done=True))
        return full

    # ─── Anthropic ──────────────────────────────────────────

    def _call_anthropic(self, messages: list[ChatMessage]) -> CompletionResult:
        system_msg = next((m for m in messages if m.role == "system"), None)
        non_system = [{"role": m.role, "content": m.content} for m in messages if m.role != "system"]

        body: dict[str, Any] = {
            "model": self._model,
            "max_tokens": self._max_tokens,
            "temperature": self._temperature,
            "messages": non_system,
        }
        if system_msg:
            body["system"] = system_msg.content

        data = self._request(
            f"{self._base_url}/messages",
            body,
            {"x-api-key": self._api_key, "anthropic-version": "2023-06-01"},
        )
        text_block = next((b for b in data.get("content", []) if b.get("type") == "text"), None)
        return CompletionResult(
            content=text_block["text"] if text_block else "",
            model=data["model"],
            usage={
                "promptTokens": data.get("usage", {}).get("input_tokens", 0),
                "completionTokens": data.get("usage", {}).get("output_tokens", 0),
                "totalTokens": data.get("usage", {}).get("input_tokens", 0) + data.get("usage", {}).get("output_tokens", 0),
            },
            finish_reason=data.get("stop_reason", "end_turn"),
        )

    def _stream_anthropic(self, messages: list[ChatMessage]) -> str:
        system_msg = next((m for m in messages if m.role == "system"), None)
        non_system = [{"role": m.role, "content": m.content} for m in messages if m.role != "system"]

        body: dict[str, Any] = {
            "model": self._model,
            "max_tokens": self._max_tokens,
            "temperature": self._temperature,
            "stream": True,
            "messages": non_system,
        }
        if system_msg:
            body["system"] = system_msg.content

        full = ""
        for chunk in self._request_stream(
            f"{self._base_url}/messages",
            body,
            {"x-api-key": self._api_key, "anthropic-version": "2023-06-01"},
        ):
            try:
                parsed = json.loads(chunk)
            except json.JSONDecodeError:
                continue
            if parsed.get("type") == "content_block_delta":
                delta = parsed.get("delta", {}).get("text", "")
                if delta:
                    full += delta
                    self._emit("onChunk", StreamChunk(content=delta, done=False))
        self._emit("onChunk", StreamChunk(content="", done=True))
        return full

    # ─── Ollama ─────────────────────────────────────────────

    def _call_ollama(self, messages: list[ChatMessage]) -> CompletionResult:
        data = self._request(
            f"{self._base_url}/api/chat",
            {
                "model": self._model,
                "messages": [{"role": m.role, "content": m.content} for m in messages],
                "stream": False,
                "options": {"num_predict": self._max_tokens, "temperature": self._temperature},
            },
            {},
        )
        return CompletionResult(
            content=data.get("message", {}).get("content", ""),
            model=data.get("model", self._model),
            usage={
                "promptTokens": data.get("prompt_eval_count", 0),
                "completionTokens": data.get("eval_count", 0),
                "totalTokens": data.get("prompt_eval_count", 0) + data.get("eval_count", 0),
            },
            finish_reason="stop",
        )

    def _stream_ollama(self, messages: list[ChatMessage]) -> str:
        req = Request(
            f"{self._base_url}/api/chat",
            data=json.dumps({
                "model": self._model,
                "messages": [{"role": m.role, "content": m.content} for m in messages],
                "stream": True,
                "options": {"num_predict": self._max_tokens, "temperature": self._temperature},
            }).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        full = ""
        resp = urlopen(req)
        try:
            for raw_line in resp:
                line = raw_line.decode("utf-8").strip()
                if not line:
                    continue
                parsed = json.loads(line)
                content = parsed.get("message", {}).get("content", "")
                if content:
                    full += content
                    self._emit("onChunk", StreamChunk(content=content, done=False))
                if parsed.get("done"):
                    break
        finally:
            resp.close()
        self._emit("onChunk", StreamChunk(content="", done=True))
        return full
