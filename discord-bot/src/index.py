# @radzor/discord-bot — Discord bot

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Callable
from urllib.request import Request, urlopen

API = "https://discord.com/api/v10"


@dataclass
class DiscordBotConfig:
    bot_token: str
    application_id: str | None = None


@dataclass
class DiscordMessage:
    id: str
    channel_id: str
    content: str
    author_id: str


@dataclass
class DiscordEmbed:
    title: str | None = None
    description: str | None = None
    color: int | None = None
    fields: list[dict[str, Any]] | None = None
    footer: dict[str, str] | None = None


class DiscordBot:
    def __init__(self, config: DiscordBotConfig) -> None:
        self._token = config.bot_token
        self._app_id = config.application_id
        self._listeners: dict[str, list[Callable]] = {}

    def on(self, event: str, listener: Callable) -> None:
        self._listeners.setdefault(event, []).append(listener)

    def off(self, event: str, listener: Callable) -> None:
        self._listeners[event] = [l for l in self._listeners.get(event, []) if l is not listener]

    def _emit(self, event: str, payload: Any) -> None:
        for listener in self._listeners.get(event, []):
            listener(payload)

    def send_message(self, channel_id: str, content: str) -> DiscordMessage:
        return self._api_request("POST", f"/channels/{channel_id}/messages", {"content": content})

    def send_embed(self, channel_id: str, embed: DiscordEmbed) -> DiscordMessage:
        embed_dict = {k: v for k, v in embed.__dict__.items() if v is not None}
        return self._api_request("POST", f"/channels/{channel_id}/messages", {"embeds": [embed_dict]})

    def reply_to(self, channel_id: str, message_id: str, content: str) -> DiscordMessage:
        return self._api_request("POST", f"/channels/{channel_id}/messages", {
            "content": content,
            "message_reference": {"message_id": message_id},
        })

    def delete_message(self, channel_id: str, message_id: str) -> None:
        self._api_request("DELETE", f"/channels/{channel_id}/messages/{message_id}")

    def _api_request(self, method: str, path: str, body: dict | None = None) -> Any:
        try:
            data = json.dumps(body).encode() if body else None
            req = Request(f"{API}{path}", data=data, headers={
                "Authorization": f"Bot {self._token}",
                "Content-Type": "application/json",
            }, method=method)

            with urlopen(req) as resp:
                if resp.status == 204:
                    return None
                result = json.loads(resp.read().decode())

            return DiscordMessage(
                id=result["id"],
                channel_id=result.get("channel_id", ""),
                content=result.get("content", ""),
                author_id=result.get("author", {}).get("id", ""),
            )
        except Exception as e:
            self._emit("onError", {"code": "API_ERROR", "message": str(e)})
            raise
