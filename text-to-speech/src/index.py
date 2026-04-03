# @radzor/text-to-speech — Text-to-speech synthesis

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Callable, Literal
from urllib.request import Request, urlopen


Provider = Literal["openai", "elevenlabs"]


@dataclass
class TextToSpeechConfig:
    provider: Provider
    api_key: str
    voice: str | None = None
    model: str | None = None
    speed: float = 1.0


@dataclass
class SynthesizeOptions:
    voice: str | None = None
    speed: float | None = None
    format: str = "mp3"


_PROVIDER_DEFAULTS: dict[str, dict[str, str]] = {
    "openai": {"url": "https://api.openai.com/v1", "model": "tts-1", "voice": "alloy"},
    "elevenlabs": {"url": "https://api.elevenlabs.io/v1", "model": "eleven_multilingual_v2", "voice": "21m00Tcm4TlvDq8ikWAM"},
}


class TextToSpeech:
    def __init__(self, config: TextToSpeechConfig) -> None:
        defaults = _PROVIDER_DEFAULTS[config.provider]
        self._provider = config.provider
        self._api_key = config.api_key
        self._voice = config.voice or defaults["voice"]
        self._model = config.model or defaults["model"]
        self._speed = config.speed
        self._listeners: dict[str, list[Callable]] = {}

    def on(self, event: str, listener: Callable) -> None:
        self._listeners.setdefault(event, []).append(listener)

    def off(self, event: str, listener: Callable) -> None:
        self._listeners[event] = [l for l in self._listeners.get(event, []) if l is not listener]

    def _emit(self, event: str, payload: Any) -> None:
        for listener in self._listeners.get(event, []):
            listener(payload)

    def synthesize(self, text: str, options: SynthesizeOptions | None = None) -> bytes:
        """Convert text to speech audio."""
        opts = options or SynthesizeOptions()
        try:
            if self._provider == "openai":
                return self._synthesize_openai(text, opts)
            elif self._provider == "elevenlabs":
                return self._synthesize_elevenlabs(text, opts)
            else:
                raise ValueError(f"Unknown provider: {self._provider}")
        except Exception as e:
            self._emit("onError", {"code": "SYNTHESIS_FAILED", "message": str(e)})
            raise

    def synthesize_to_file(self, text: str, output_path: str, options: SynthesizeOptions | None = None) -> None:
        """Convert text to speech and save to a file."""
        audio = self.synthesize(text, options)
        with open(output_path, "wb") as f:
            f.write(audio)

    # ─── OpenAI TTS ─────────────────────────────────────────

    def _synthesize_openai(self, text: str, opts: SynthesizeOptions) -> bytes:
        voice = opts.voice or self._voice
        fmt = opts.format or "mp3"
        speed = opts.speed or self._speed

        body = json.dumps({
            "model": self._model,
            "input": text,
            "voice": voice,
            "speed": speed,
            "response_format": fmt,
        }).encode()

        req = Request(f"{_PROVIDER_DEFAULTS['openai']['url']}/audio/speech", data=body, headers={
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }, method="POST")

        with urlopen(req) as resp:
            audio = resp.read()

        self._emit("onSynthesized", {"size": len(audio), "format": fmt, "voice": voice})
        return audio

    # ─── ElevenLabs ─────────────────────────────────────────

    def _synthesize_elevenlabs(self, text: str, opts: SynthesizeOptions) -> bytes:
        voice = opts.voice or self._voice
        fmt = opts.format or "mp3"

        body = json.dumps({
            "text": text,
            "model_id": self._model,
            "voice_settings": {
                "stability": 0.5,
                "similarity_boost": 0.75,
            },
        }).encode()

        req = Request(
            f"{_PROVIDER_DEFAULTS['elevenlabs']['url']}/text-to-speech/{voice}",
            data=body,
            headers={
                "xi-api-key": self._api_key,
                "Content-Type": "application/json",
                "Accept": f"audio/{fmt}",
            },
            method="POST",
        )

        with urlopen(req) as resp:
            audio = resp.read()

        self._emit("onSynthesized", {"size": len(audio), "format": fmt, "voice": voice})
        return audio
