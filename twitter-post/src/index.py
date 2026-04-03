# @radzor/twitter-post — Twitter/X API v2

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Callable
from urllib.request import Request, urlopen

API_URL = "https://api.twitter.com/2"


@dataclass
class TwitterPostConfig:
    bearer_token: str


@dataclass
class TweetResult:
    tweet_id: str
    text: str


class TwitterPost:
    def __init__(self, config: TwitterPostConfig) -> None:
        self._token = config.bearer_token
        self._listeners: dict[str, list[Callable]] = {}

    def on(self, event: str, listener: Callable) -> None:
        self._listeners.setdefault(event, []).append(listener)

    def off(self, event: str, listener: Callable) -> None:
        self._listeners[event] = [l for l in self._listeners.get(event, []) if l is not listener]

    def _emit(self, event: str, payload: Any) -> None:
        for listener in self._listeners.get(event, []):
            listener(payload)

    def tweet(self, text: str) -> TweetResult:
        """Post a single tweet."""
        return self._post_tweet(text)

    def thread(self, tweets: list[str]) -> list[TweetResult]:
        """Post a thread of tweets."""
        results: list[TweetResult] = []
        reply_to: str | None = None
        for text in tweets:
            result = self._post_tweet(text, reply_to)
            results.append(result)
            reply_to = result.tweet_id
        return results

    def delete_tweet(self, tweet_id: str) -> None:
        """Delete a tweet."""
        req = Request(f"{API_URL}/tweets/{tweet_id}", headers={
            "Authorization": f"Bearer {self._token}",
        }, method="DELETE")
        with urlopen(req) as resp:
            resp.read()

    def _post_tweet(self, text: str, reply_to: str | None = None) -> TweetResult:
        try:
            body: dict[str, Any] = {"text": text}
            if reply_to:
                body["reply"] = {"in_reply_to_tweet_id": reply_to}

            req = Request(f"{API_URL}/tweets", data=json.dumps(body).encode(), headers={
                "Authorization": f"Bearer {self._token}",
                "Content-Type": "application/json",
            }, method="POST")

            with urlopen(req) as resp:
                data = json.loads(resp.read().decode())

            result = TweetResult(tweet_id=data["data"]["id"], text=data["data"]["text"])
            self._emit("onTweeted", {"tweetId": result.tweet_id, "text": result.text})
            return result
        except Exception as e:
            self._emit("onError", {"code": "TWEET_FAILED", "message": str(e)})
            raise
