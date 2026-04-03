# @radzor/image-generation — Multi-provider image generation

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Callable, Literal
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import time


Provider = Literal["openai", "stability", "replicate"]
ResponseFormat = Literal["url", "base64"]


@dataclass
class ImageGenerationConfig:
    provider: Provider
    api_key: str
    model: str | None = None
    default_size: str = "1024x1024"
    response_format: ResponseFormat = "url"


@dataclass
class GenerateOptions:
    size: str | None = None
    response_format: ResponseFormat | None = None
    n: int = 1


@dataclass
class ImageGenerationResult:
    provider: Provider
    model: str
    url: str | None = None
    base64: str | None = None
    revised_prompt: str | None = None


_PROVIDER_DEFAULTS: dict[str, dict[str, str]] = {
    "openai": {"url": "https://api.openai.com/v1", "model": "dall-e-3"},
    "stability": {"url": "https://api.stability.ai/v1", "model": "stable-diffusion-xl-1024-v1-0"},
    "replicate": {"url": "https://api.replicate.com/v1", "model": "black-forest-labs/flux-schnell"},
}


class ImageGeneration:
    def __init__(self, config: ImageGenerationConfig) -> None:
        defaults = _PROVIDER_DEFAULTS[config.provider]
        self._provider = config.provider
        self._api_key = config.api_key
        self._model = config.model or defaults["model"]
        self._default_size = config.default_size
        self._response_format = config.response_format
        self._listeners: dict[str, list[Callable]] = {}

    def on(self, event: str, listener: Callable) -> None:
        self._listeners.setdefault(event, []).append(listener)

    def off(self, event: str, listener: Callable) -> None:
        self._listeners[event] = [l for l in self._listeners.get(event, []) if l is not listener]

    def _emit(self, event: str, payload: Any) -> None:
        for listener in self._listeners.get(event, []):
            listener(payload)

    def generate(self, prompt: str, options: GenerateOptions | None = None) -> ImageGenerationResult:
        """Generate an image from a text prompt."""
        opts = options or GenerateOptions()
        size = opts.size or self._default_size
        fmt = opts.response_format or self._response_format

        try:
            if self._provider == "openai":
                return self._generate_openai(prompt, size, fmt, 1)[0]
            elif self._provider == "stability":
                return self._generate_stability(prompt, size)
            elif self._provider == "replicate":
                return self._generate_replicate(prompt, size)
            else:
                raise ValueError(f"Unknown provider: {self._provider}")
        except Exception as e:
            self._emit("onError", {"code": "GENERATION_FAILED", "message": str(e), "provider": self._provider})
            raise

    def generate_multiple(self, prompt: str, count: int) -> list[ImageGenerationResult]:
        """Generate multiple images from a single prompt."""
        if self._provider == "openai":
            return self._generate_openai(prompt, self._default_size, self._response_format, count)
        return [self.generate(prompt) for _ in range(count)]

    # ─── OpenAI DALL-E ──────────────────────────────────────

    def _generate_openai(self, prompt: str, size: str, fmt: ResponseFormat, n: int) -> list[ImageGenerationResult]:
        body = json.dumps({
            "model": self._model,
            "prompt": prompt,
            "n": n,
            "size": size,
            "response_format": "b64_json" if fmt == "base64" else "url",
        }).encode()

        req = Request(f"{_PROVIDER_DEFAULTS['openai']['url']}/images/generations", data=body, headers={
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }, method="POST")

        with urlopen(req) as resp:
            data = json.loads(resp.read().decode())

        results = []
        for img in data["data"]:
            result = ImageGenerationResult(
                url=img.get("url"),
                base64=img.get("b64_json"),
                revised_prompt=img.get("revised_prompt"),
                provider="openai",
                model=self._model,
            )
            self._emit("onGenerated", {"url": img.get("url", "(base64)"), "prompt": prompt, "provider": "openai"})
            results.append(result)
        return results

    # ─── Stability AI ──────────────────────────────────────

    def _generate_stability(self, prompt: str, size: str) -> ImageGenerationResult:
        w, h = (int(x) for x in size.split("x"))
        body = json.dumps({
            "text_prompts": [{"text": prompt, "weight": 1}],
            "cfg_scale": 7,
            "width": w,
            "height": h,
            "steps": 30,
            "samples": 1,
        }).encode()

        req = Request(
            f"{_PROVIDER_DEFAULTS['stability']['url']}/generation/{self._model}/text-to-image",
            data=body,
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
            method="POST",
        )

        with urlopen(req) as resp:
            data = json.loads(resp.read().decode())

        img = data["artifacts"][0]
        result = ImageGenerationResult(base64=img["base64"], provider="stability", model=self._model)
        self._emit("onGenerated", {"url": "(base64)", "prompt": prompt, "provider": "stability"})
        return result

    # ─── Replicate ─────────────────────────────────────────

    def _generate_replicate(self, prompt: str, size: str) -> ImageGenerationResult:
        w, h = (int(x) for x in size.split("x"))
        body = json.dumps({
            "model": self._model,
            "input": {"prompt": prompt, "width": w, "height": h},
        }).encode()

        req = Request(f"{_PROVIDER_DEFAULTS['replicate']['url']}/predictions", data=body, headers={
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
            "Prefer": "wait",
        }, method="POST")

        with urlopen(req) as resp:
            prediction = json.loads(resp.read().decode())

        output = prediction.get("output")
        if not output and prediction.get("urls", {}).get("get"):
            output = self._poll_replicate(prediction["urls"]["get"])

        url = output[0] if isinstance(output, list) else output
        result = ImageGenerationResult(url=url, provider="replicate", model=self._model)
        self._emit("onGenerated", {"url": url or "", "prompt": prompt, "provider": "replicate"})
        return result

    def _poll_replicate(self, get_url: str, max_attempts: int = 60) -> str:
        for _ in range(max_attempts):
            time.sleep(1)
            req = Request(get_url, headers={"Authorization": f"Bearer {self._api_key}"})
            with urlopen(req) as resp:
                data = json.loads(resp.read().decode())
            if data["status"] == "succeeded":
                return data["output"]
            if data["status"] == "failed":
                raise RuntimeError(data.get("error", "Replicate prediction failed"))
        raise TimeoutError("Replicate prediction timed out")
