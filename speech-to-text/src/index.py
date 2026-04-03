# @radzor/speech-to-text — Audio transcription

from __future__ import annotations

import json
import mimetypes
import os
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Literal
from urllib.request import Request, urlopen


Provider = Literal["openai", "deepgram"]


@dataclass
class SpeechToTextConfig:
    provider: Provider
    api_key: str
    model: str | None = None
    language: str | None = None


@dataclass
class TranscribeOptions:
    language: str | None = None
    timestamps: bool = False


@dataclass
class WordTimestamp:
    word: str
    start: float
    end: float


@dataclass
class TranscriptionResult:
    text: str
    language: str
    duration: float
    provider: Provider
    words: list[WordTimestamp] | None = None


_PROVIDER_DEFAULTS: dict[str, dict[str, str]] = {
    "openai": {"url": "https://api.openai.com/v1", "model": "whisper-1"},
    "deepgram": {"url": "https://api.deepgram.com/v1", "model": "nova-2"},
}


class SpeechToText:
    def __init__(self, config: SpeechToTextConfig) -> None:
        defaults = _PROVIDER_DEFAULTS[config.provider]
        self._provider = config.provider
        self._api_key = config.api_key
        self._model = config.model or defaults["model"]
        self._language = config.language
        self._listeners: dict[str, list[Callable]] = {}

    def on(self, event: str, listener: Callable) -> None:
        self._listeners.setdefault(event, []).append(listener)

    def off(self, event: str, listener: Callable) -> None:
        self._listeners[event] = [l for l in self._listeners.get(event, []) if l is not listener]

    def _emit(self, event: str, payload: Any) -> None:
        for listener in self._listeners.get(event, []):
            listener(payload)

    def transcribe(self, audio: bytes | str, options: TranscribeOptions | None = None) -> TranscriptionResult:
        """Transcribe audio to text."""
        opts = options or TranscribeOptions()
        try:
            if self._provider == "openai":
                return self._transcribe_openai(audio, opts)
            elif self._provider == "deepgram":
                return self._transcribe_deepgram(audio, opts)
            else:
                raise ValueError(f"Unknown provider: {self._provider}")
        except Exception as e:
            self._emit("onError", {"code": "TRANSCRIPTION_FAILED", "message": str(e)})
            raise

    # ─── OpenAI Whisper ─────────────────────────────────────

    def _transcribe_openai(self, audio: bytes | str, opts: TranscribeOptions) -> TranscriptionResult:
        if isinstance(audio, str):
            with open(audio, "rb") as f:
                audio_data = f.read()
            filename = os.path.basename(audio)
        else:
            audio_data = audio
            filename = "audio.wav"

        boundary = uuid.uuid4().hex
        lines: list[bytes] = []

        # file field
        lines.append(f"--{boundary}".encode())
        lines.append(f'Content-Disposition: form-data; name="file"; filename="{filename}"'.encode())
        mime = mimetypes.guess_type(filename)[0] or "audio/wav"
        lines.append(f"Content-Type: {mime}".encode())
        lines.append(b"")
        lines.append(audio_data)

        # model field
        lines.append(f"--{boundary}".encode())
        lines.append(b'Content-Disposition: form-data; name="model"')
        lines.append(b"")
        lines.append(self._model.encode())

        # response_format
        lines.append(f"--{boundary}".encode())
        lines.append(b'Content-Disposition: form-data; name="response_format"')
        lines.append(b"")
        lines.append(b"verbose_json")

        # language
        lang = opts.language or self._language
        if lang:
            lines.append(f"--{boundary}".encode())
            lines.append(b'Content-Disposition: form-data; name="language"')
            lines.append(b"")
            lines.append(lang.encode())

        if opts.timestamps:
            lines.append(f"--{boundary}".encode())
            lines.append(b'Content-Disposition: form-data; name="timestamp_granularities[]"')
            lines.append(b"")
            lines.append(b"word")

        lines.append(f"--{boundary}--".encode())
        body = b"\r\n".join(lines)

        req = Request(
            f"{_PROVIDER_DEFAULTS['openai']['url']}/audio/transcriptions",
            data=body,
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": f"multipart/form-data; boundary={boundary}",
            },
            method="POST",
        )

        with urlopen(req) as resp:
            data = json.loads(resp.read().decode())

        words = None
        if data.get("words"):
            words = [WordTimestamp(word=w["word"], start=w["start"], end=w["end"]) for w in data["words"]]

        result = TranscriptionResult(
            text=data["text"],
            language=data.get("language", ""),
            duration=data.get("duration", 0),
            provider="openai",
            words=words,
        )
        self._emit("onTranscribed", {"text": result.text, "language": result.language, "duration": result.duration})
        return result

    # ─── Deepgram ───────────────────────────────────────────

    def _transcribe_deepgram(self, audio: bytes | str, opts: TranscribeOptions) -> TranscriptionResult:
        if isinstance(audio, str):
            with open(audio, "rb") as f:
                audio_data = f.read()
        else:
            audio_data = audio

        params = f"model={self._model}&smart_format=true"
        lang = opts.language or self._language
        if lang:
            params += f"&language={lang}"
        else:
            params += "&detect_language=true"
        if opts.timestamps:
            params += "&utterances=true"

        req = Request(
            f"{_PROVIDER_DEFAULTS['deepgram']['url']}/listen?{params}",
            data=audio_data,
            headers={
                "Authorization": f"Token {self._api_key}",
                "Content-Type": "audio/wav",
            },
            method="POST",
        )

        with urlopen(req) as resp:
            data = json.loads(resp.read().decode())

        channel = data.get("results", {}).get("channels", [{}])[0]
        alt = channel.get("alternatives", [{}])[0]

        words = None
        if alt.get("words"):
            words = [WordTimestamp(word=w["word"], start=w["start"], end=w["end"]) for w in alt["words"]]

        result = TranscriptionResult(
            text=alt.get("transcript", ""),
            language=channel.get("detected_language", ""),
            duration=data.get("metadata", {}).get("duration", 0),
            provider="deepgram",
            words=words,
        )
        self._emit("onTranscribed", {"text": result.text, "language": result.language, "duration": result.duration})
        return result
