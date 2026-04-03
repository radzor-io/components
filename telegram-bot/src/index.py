# @radzor/telegram-bot — Telegram Bot API

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Callable
from urllib.request import Request, urlopen

API_BASE = "https://api.telegram.org"


@dataclass
class TelegramBotConfig:
    bot_token: str


@dataclass
class TelegramMessage:
    message_id: int
    chat_id: int
    text: str | None = None
    date: int = 0


@dataclass
class InlineKeyboardButton:
    text: str
    url: str | None = None
    callback_data: str | None = None


@dataclass
class ReplyKeyboardButton:
    text: str
    request_contact: bool = False
    request_location: bool = False


class TelegramBot:
    def __init__(self, config: TelegramBotConfig) -> None:
        self._token = config.bot_token
        self._listeners: dict[str, list[Callable]] = {}

    def on(self, event: str, listener: Callable) -> None:
        self._listeners.setdefault(event, []).append(listener)

    def off(self, event: str, listener: Callable) -> None:
        self._listeners[event] = [l for l in self._listeners.get(event, []) if l is not listener]

    def _emit(self, event: str, payload: Any) -> None:
        for listener in self._listeners.get(event, []):
            listener(payload)

    def send_message(self, chat_id: int | str, text: str, parse_mode: str | None = None) -> TelegramMessage:
        body: dict[str, Any] = {"chat_id": chat_id, "text": text}
        if parse_mode:
            body["parse_mode"] = parse_mode
        return self._api_call("sendMessage", body)

    def send_photo(self, chat_id: int | str, photo_url: str, caption: str | None = None) -> TelegramMessage:
        body: dict[str, Any] = {"chat_id": chat_id, "photo": photo_url}
        if caption:
            body["caption"] = caption
        return self._api_call("sendPhoto", body)

    def send_reply_keyboard(self, chat_id: int | str, text: str, keyboard: list[list[dict]]) -> TelegramMessage:
        return self._api_call("sendMessage", {
            "chat_id": chat_id,
            "text": text,
            "reply_markup": {"keyboard": keyboard, "resize_keyboard": True, "one_time_keyboard": True},
        })

    def send_inline_keyboard(self, chat_id: int | str, text: str, buttons: list[list[InlineKeyboardButton]]) -> TelegramMessage:
        inline_keyboard = [
            [
                {k: v for k, v in {"text": b.text, "url": b.url, "callback_data": b.callback_data}.items() if v is not None}
                for b in row
            ]
            for row in buttons
        ]
        return self._api_call("sendMessage", {
            "chat_id": chat_id,
            "text": text,
            "reply_markup": {"inline_keyboard": inline_keyboard},
        })

    def _api_call(self, method: str, body: dict[str, Any]) -> TelegramMessage:
        try:
            data = json.dumps(body).encode()
            req = Request(f"{API_BASE}/bot{self._token}/{method}", data=data, headers={
                "Content-Type": "application/json",
            })

            with urlopen(req) as resp:
                result = json.loads(resp.read().decode())

            if not result.get("ok"):
                raise Exception(result.get("description", f"Telegram API error"))

            r = result["result"]
            msg = TelegramMessage(
                message_id=r["message_id"],
                chat_id=r["chat"]["id"],
                text=r.get("text"),
                date=r.get("date", 0),
            )
            self._emit("onMessageSent", msg)
            return msg
        except Exception as e:
            self._emit("onError", {"code": "API_ERROR", "message": str(e)})
            raise
