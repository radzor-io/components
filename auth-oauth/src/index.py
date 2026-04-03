# @radzor/auth-oauth — OAuth 2.0 authentication flow

from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
from base64 import urlsafe_b64decode, urlsafe_b64encode
from dataclasses import dataclass, field
from typing import Any, Callable, Literal
from urllib.parse import urlencode
from urllib.request import Request, urlopen


OAuthProvider = Literal["google", "github", "discord"]


@dataclass
class ClientCredentials:
    client_id: str
    client_secret: str


@dataclass
class AuthOAuthConfig:
    redirect_url: str
    jwt_secret: str
    providers: list[OAuthProvider] = field(default_factory=list)
    client_credentials: dict[str, ClientCredentials] = field(default_factory=dict)
    scopes: list[str] | None = None
    session_duration: int = 86400  # seconds


@dataclass
class AuthSession:
    access_token: str
    refresh_token: str
    expires_at: float
    provider: OAuthProvider


@dataclass
class UserProfile:
    id: str
    email: str
    name: str
    avatar: str | None
    provider: OAuthProvider


_PROVIDER_URLS: dict[str, dict[str, str]] = {
    "google": {
        "authorize": "https://accounts.google.com/o/oauth2/v2/auth",
        "token": "https://oauth2.googleapis.com/token",
        "userinfo": "https://www.googleapis.com/oauth2/v2/userinfo",
    },
    "github": {
        "authorize": "https://github.com/login/oauth/authorize",
        "token": "https://github.com/login/oauth/access_token",
        "userinfo": "https://api.github.com/user",
    },
    "discord": {
        "authorize": "https://discord.com/api/oauth2/authorize",
        "token": "https://discord.com/api/oauth2/token",
        "userinfo": "https://discord.com/api/users/@me",
    },
}

_DEFAULT_SCOPES: dict[str, list[str]] = {
    "google": ["openid", "profile", "email"],
    "github": ["read:user", "user:email"],
    "discord": ["identify", "email"],
}


class AuthOAuth:
    def __init__(self, config: AuthOAuthConfig) -> None:
        self._config = config
        self._session: AuthSession | None = None
        self._user: UserProfile | None = None
        self._listeners: dict[str, list[Callable]] = {}

    def on(self, event: str, listener: Callable) -> None:
        self._listeners.setdefault(event, []).append(listener)

    def off(self, event: str, listener: Callable) -> None:
        listeners = self._listeners.get(event, [])
        self._listeners[event] = [l for l in listeners if l is not listener]

    def _emit(self, event: str, payload: Any) -> None:
        for listener in self._listeners.get(event, []):
            listener(payload)

    # ─── Public API ─────────────────────────────────────────

    def get_authorization_url(self, provider: OAuthProvider) -> str:
        """Get the authorization URL to redirect the user to."""
        urls = _PROVIDER_URLS[provider]
        creds = self._config.client_credentials[provider]
        scopes = self._config.scopes or _DEFAULT_SCOPES[provider]
        params = urlencode({
            "client_id": creds.client_id,
            "redirect_uri": self._config.redirect_url,
            "response_type": "code",
            "scope": " ".join(scopes),
            "state": self._generate_state(provider),
        })
        return f"{urls['authorize']}?{params}"

    def login(self, provider: OAuthProvider) -> str:
        """Initiate the OAuth login flow — returns the auth URL."""
        if provider not in self._config.providers:
            err = {"code": "INVALID_PROVIDER", "message": f'Provider "{provider}" is not configured'}
            self._emit("onError", err)
            raise ValueError(err["message"])
        return self.get_authorization_url(provider)

    def handle_callback(self, provider: OAuthProvider, code: str) -> AuthSession:
        """Handle the OAuth callback — exchange code for tokens and fetch user profile."""
        try:
            urls = _PROVIDER_URLS[provider]
            creds = self._config.client_credentials[provider]

            # Exchange code for tokens
            token_body = urlencode({
                "client_id": creds.client_id,
                "client_secret": creds.client_secret,
                "code": code,
                "redirect_uri": self._config.redirect_url,
                "grant_type": "authorization_code",
            }).encode()

            req = Request(urls["token"], data=token_body, headers={
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/json",
            }, method="POST")
            with urlopen(req) as resp:
                token_data = json.loads(resp.read().decode())

            # Fetch user profile
            user_req = Request(urls["userinfo"], headers={
                "Authorization": f"Bearer {token_data['access_token']}",
            })
            with urlopen(user_req) as resp:
                user_data = json.loads(resp.read().decode())

            self._user = self._normalize_user(provider, user_data)
            expires_at = time.time() + self._config.session_duration
            self._session = AuthSession(
                access_token=token_data["access_token"],
                refresh_token=token_data.get("refresh_token", ""),
                expires_at=expires_at,
                provider=provider,
            )
            self._emit("onLogin", {"userId": self._user.id, "provider": provider})
            return self._session
        except Exception as e:
            self._emit("onError", {"code": "AUTH_FAILED", "message": str(e)})
            raise

    def logout(self) -> None:
        """End the current session."""
        user_id = self._user.id if self._user else "unknown"
        self._session = None
        self._user = None
        self._emit("onLogout", {"userId": user_id})

    def get_session(self) -> AuthSession | None:
        if self._session and time.time() > self._session.expires_at:
            self._session = None
            self._user = None
        return self._session

    def get_user(self) -> UserProfile | None:
        return self._user

    def refresh_token(self) -> AuthSession:
        """Refresh the access token using the refresh token."""
        if not self._session or not self._session.refresh_token:
            raise ValueError("No refresh token available")

        provider = self._session.provider
        urls = _PROVIDER_URLS[provider]
        creds = self._config.client_credentials[provider]

        body = urlencode({
            "client_id": creds.client_id,
            "client_secret": creds.client_secret,
            "refresh_token": self._session.refresh_token,
            "grant_type": "refresh_token",
        }).encode()

        req = Request(urls["token"], data=body, headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
        }, method="POST")

        with urlopen(req) as resp:
            if resp.status >= 400:
                err = {"code": "REFRESH_FAILED", "message": f"Token refresh failed: {resp.status}"}
                self._emit("onError", err)
                raise RuntimeError(err["message"])
            data = json.loads(resp.read().decode())

        expires_at = time.time() + self._config.session_duration
        self._session = AuthSession(
            access_token=data["access_token"],
            refresh_token=data.get("refresh_token", self._session.refresh_token),
            expires_at=expires_at,
            provider=provider,
        )
        self._emit("onTokenRefresh", {"expiresAt": expires_at})
        return self._session

    # ─── JWT ────────────────────────────────────────────────

    def create_session_token(self) -> str:
        """Create a signed JWT for the current session."""
        if not self._session or not self._user:
            raise ValueError("No active session")

        header = {"alg": "HS256", "typ": "JWT"}
        now = int(time.time())
        payload = {
            "sub": self._user.id,
            "email": self._user.email,
            "provider": self._session.provider,
            "iat": now,
            "exp": now + self._config.session_duration,
        }

        segments = [
            urlsafe_b64encode(json.dumps(header).encode()).rstrip(b"=").decode(),
            urlsafe_b64encode(json.dumps(payload).encode()).rstrip(b"=").decode(),
        ]
        signing_input = f"{segments[0]}.{segments[1]}"
        signature = hmac.new(
            self._config.jwt_secret.encode(), signing_input.encode(), hashlib.sha256
        ).digest()
        segments.append(urlsafe_b64encode(signature).rstrip(b"=").decode())
        return ".".join(segments)

    def verify_session_token(self, token: str) -> dict[str, Any]:
        """Verify and decode a session JWT."""
        parts = token.split(".")
        if len(parts) != 3:
            raise ValueError("Invalid JWT format")

        signing_input = f"{parts[0]}.{parts[1]}"
        expected_sig = hmac.new(
            self._config.jwt_secret.encode(), signing_input.encode(), hashlib.sha256
        ).digest()
        actual_sig = urlsafe_b64decode(parts[2] + "==")

        if not hmac.compare_digest(expected_sig, actual_sig):
            raise ValueError("Invalid JWT signature")

        payload_json = urlsafe_b64decode(parts[1] + "==").decode()
        payload = json.loads(payload_json)

        if payload.get("exp", 0) < time.time():
            raise ValueError("JWT has expired")

        return payload

    # ─── Private ────────────────────────────────────────────

    def _normalize_user(self, provider: OAuthProvider, data: dict) -> UserProfile:
        if provider == "google":
            return UserProfile(
                id=str(data["id"]), email=str(data["email"]),
                name=str(data["name"]), avatar=data.get("picture"), provider=provider,
            )
        elif provider == "github":
            return UserProfile(
                id=str(data["id"]), email=str(data.get("email", "")),
                name=str(data.get("name") or data.get("login", "")),
                avatar=data.get("avatar_url"), provider=provider,
            )
        else:  # discord
            avatar = (
                f"https://cdn.discordapp.com/avatars/{data['id']}/{data['avatar']}.png"
                if data.get("avatar") else None
            )
            return UserProfile(
                id=str(data["id"]), email=str(data.get("email", "")),
                name=str(data.get("username", "")), avatar=avatar, provider=provider,
            )

    @staticmethod
    def _generate_state(provider: str) -> str:
        return f"{provider}:{os.urandom(16).hex()}"
