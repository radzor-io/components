# @radzor/reddit-post — Reddit API integration

from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from typing import Any, Callable
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import time

TOKEN_URL = "https://www.reddit.com/api/v1/access_token"
API_BASE = "https://oauth.reddit.com"
USER_AGENT = "radzor:reddit-post:v0.1.0"


@dataclass
class RedditConfig:
    client_id: str
    client_secret: str
    username: str
    password: str


@dataclass
class RedditPost:
    id: str
    name: str
    url: str
    title: str


@dataclass
class RedditComment:
    id: str
    name: str
    body: str


class RedditClient:
    def __init__(self, config: RedditConfig) -> None:
        self._client_id = config.client_id
        self._client_secret = config.client_secret
        self._username = config.username
        self._password = config.password
        self._access_token: str | None = None
        self._token_expiry: float = 0
        self._listeners: dict[str, list[Callable]] = {}

    def on(self, event: str, listener: Callable) -> None:
        self._listeners.setdefault(event, []).append(listener)

    def off(self, event: str, listener: Callable) -> None:
        self._listeners[event] = [l for l in self._listeners.get(event, []) if l is not listener]

    def _emit(self, event: str, payload: Any) -> None:
        for listener in self._listeners.get(event, []):
            listener(payload)

    def _authenticate(self) -> str:
        if self._access_token and time.time() < self._token_expiry:
            return self._access_token

        creds = base64.b64encode(f"{self._client_id}:{self._client_secret}".encode()).decode()
        body = urlencode({
            "grant_type": "password",
            "username": self._username,
            "password": self._password,
        }).encode()

        req = Request(TOKEN_URL, data=body, headers={
            "Authorization": f"Basic {creds}",
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": USER_AGENT,
        })

        with urlopen(req) as resp:
            data = json.loads(resp.read().decode())

        if "error" in data:
            raise Exception(f"Reddit auth error: {data['error']}")

        self._access_token = data["access_token"]
        self._token_expiry = time.time() + data["expires_in"]
        return self._access_token

    def _api_call(self, method: str, path: str, body: dict[str, str] | None = None) -> Any:
        token = self._authenticate()
        data = urlencode(body).encode() if body else None

        req = Request(f"{API_BASE}{path}", data=data, headers={
            "Authorization": f"Bearer {token}",
            "User-Agent": USER_AGENT,
            "Content-Type": "application/x-www-form-urlencoded",
        }, method=method)

        with urlopen(req) as resp:
            return json.loads(resp.read().decode())

    def submit_text(self, subreddit: str, title: str, text: str) -> RedditPost:
        try:
            result = self._api_call("POST", "/api/submit", {
                "sr": subreddit,
                "kind": "self",
                "title": title,
                "text": text,
            })

            data = result.get("json", {}).get("data", {})
            post = RedditPost(
                id=data.get("id", ""),
                name=data.get("name", ""),
                url=data.get("url", ""),
                title=title,
            )
            self._emit("onPostCreated", post)
            return post
        except Exception as e:
            self._emit("onError", {"code": "SUBMIT_ERROR", "message": str(e)})
            raise

    def submit_link(self, subreddit: str, title: str, url: str) -> RedditPost:
        try:
            result = self._api_call("POST", "/api/submit", {
                "sr": subreddit,
                "kind": "link",
                "title": title,
                "url": url,
            })

            data = result.get("json", {}).get("data", {})
            post = RedditPost(
                id=data.get("id", ""),
                name=data.get("name", ""),
                url=data.get("url", url),
                title=title,
            )
            self._emit("onPostCreated", post)
            return post
        except Exception as e:
            self._emit("onError", {"code": "SUBMIT_ERROR", "message": str(e)})
            raise

    def add_comment(self, thing_id: str, text: str) -> RedditComment:
        try:
            result = self._api_call("POST", "/api/comment", {
                "thing_id": thing_id,
                "text": text,
            })

            things = result.get("json", {}).get("data", {}).get("things", [{}])
            data = things[0].get("data", {}) if things else {}
            return RedditComment(
                id=data.get("id", ""),
                name=data.get("name", ""),
                body=data.get("body", text),
            )
        except Exception as e:
            self._emit("onError", {"code": "COMMENT_ERROR", "message": str(e)})
            raise
