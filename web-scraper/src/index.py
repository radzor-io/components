# @radzor/web-scraper — Web page scraping

from __future__ import annotations

import re
import time
from dataclasses import dataclass, field
from typing import Any, Callable
from urllib.request import Request, urlopen


@dataclass
class WebScraperConfig:
    user_agent: str = "RadzorBot/1.0"
    timeout: int = 30
    rate_limit: float = 1.0  # seconds between requests


@dataclass
class ScrapeResult:
    url: str
    status: int
    data: dict[str, list[str]]
    html: str


class WebScraper:
    def __init__(self, config: WebScraperConfig | None = None) -> None:
        cfg = config or WebScraperConfig()
        self._user_agent = cfg.user_agent
        self._timeout = cfg.timeout
        self._rate_limit = cfg.rate_limit
        self._last_request = 0.0
        self._listeners: dict[str, list[Callable]] = {}

    def on(self, event: str, listener: Callable) -> None:
        self._listeners.setdefault(event, []).append(listener)

    def off(self, event: str, listener: Callable) -> None:
        self._listeners[event] = [l for l in self._listeners.get(event, []) if l is not listener]

    def _emit(self, event: str, payload: Any) -> None:
        for listener in self._listeners.get(event, []):
            listener(payload)

    def fetch_html(self, url: str) -> str:
        """Fetch raw HTML content from a URL."""
        self._respect_rate_limit()
        try:
            req = Request(url, headers={"User-Agent": self._user_agent})
            with urlopen(req, timeout=self._timeout) as resp:
                html = resp.read().decode("utf-8", errors="replace")
            self._emit("onPageFetched", {"url": url, "status": 200, "size": len(html)})
            return html
        except Exception as e:
            self._emit("onError", {"code": "FETCH_FAILED", "message": str(e), "url": url})
            raise

    def scrape(self, url: str, selectors: dict[str, str]) -> ScrapeResult:
        """Fetch a page and extract data using CSS selectors."""
        html = self.fetch_html(url)
        data: dict[str, list[str]] = {}
        for name, selector in selectors.items():
            data[name] = self._extract_by_selector(html, selector)
        return ScrapeResult(url=url, status=200, data=data, html=html)

    def _extract_by_selector(self, html: str, selector: str) -> list[str]:
        results: list[str] = []
        if selector.startswith("#"):
            id_val = re.escape(selector[1:])
            pattern = re.compile(
                rf"<([a-z][a-z0-9]*)\s[^>]*id=[\"']{id_val}[\"'][^>]*>(.*?)</\1>",
                re.IGNORECASE | re.DOTALL,
            )
        elif selector.startswith("."):
            cls = re.escape(selector[1:])
            pattern = re.compile(
                rf"<([a-z][a-z0-9]*)\s[^>]*class=[\"'][^\"']*\b{cls}\b[^\"']*[\"'][^>]*>(.*?)</\1>",
                re.IGNORECASE | re.DOTALL,
            )
        elif "." in selector:
            tag, cls = selector.split(".", 1)
            tag_e, cls_e = re.escape(tag), re.escape(cls)
            pattern = re.compile(
                rf"<{tag_e}\s[^>]*class=[\"'][^\"']*\b{cls_e}\b[^\"']*[\"'][^>]*>(.*?)</{tag_e}>",
                re.IGNORECASE | re.DOTALL,
            )
        else:
            tag_e = re.escape(selector)
            pattern = re.compile(
                rf"<{tag_e}[^>]*>(.*?)</{tag_e}>",
                re.IGNORECASE | re.DOTALL,
            )

        for m in pattern.finditer(html):
            content = m.group(m.lastindex or 1)
            text = re.sub(r"<[^>]+>", "", content).strip()
            text = re.sub(r"\s+", " ", text)
            results.append(text)
        return results

    def _respect_rate_limit(self) -> None:
        now = time.time()
        elapsed = now - self._last_request
        if elapsed < self._rate_limit:
            time.sleep(self._rate_limit - elapsed)
        self._last_request = time.time()
