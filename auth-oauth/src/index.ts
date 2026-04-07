// @radzor/auth-oauth — OAuth 2.0 authentication flow

import * as jose from "jose";

export type OAuthProvider = "google" | "github" | "discord";

export interface AuthOAuthConfig {
  providers: OAuthProvider[];
  redirectUrl: string;
  scopes?: string[];
  sessionDuration?: number;
  clientCredentials: Record<OAuthProvider, { clientId: string; clientSecret: string }>;
  jwtSecret: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  provider: OAuthProvider;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  avatar: string | null;
  provider: OAuthProvider;
}

export interface AuthError {
  code: string;
  message: string;
}

export type EventMap = {
  onLogin: { userId: string; provider: string };
  onLogout: { userId: string };
  onTokenRefresh: { expiresAt: number };
  onError: AuthError;
};

export type Listener<T> = (event: T) => void;

const PROVIDER_URLS: Record<OAuthProvider, { authorize: string; token: string; userinfo: string }> = {
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    userinfo: "https://www.googleapis.com/oauth2/v2/userinfo",
  },
  github: {
    authorize: "https://github.com/login/oauth/authorize",
    token: "https://github.com/login/oauth/access_token",
    userinfo: "https://api.github.com/user",
  },
  discord: {
    authorize: "https://discord.com/api/oauth2/authorize",
    token: "https://discord.com/api/oauth2/token",
    userinfo: "https://discord.com/api/users/@me",
  },
};

const DEFAULT_SCOPES: Record<OAuthProvider, string[]> = {
  google: ["openid", "profile", "email"],
  github: ["read:user", "user:email"],
  discord: ["identify", "email"],
};

export class AuthOAuth {
  private config: AuthOAuthConfig;
  private session: AuthSession | null = null;
  private user: UserProfile | null = null;
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};

  constructor(config: AuthOAuthConfig) {
    this.config = {
      scopes: config.scopes,
      sessionDuration: config.sessionDuration ?? 86400,
      ...config,
    };
  }

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event]!.push(listener);
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    const list = this.listeners[event];
    if (list) {
      this.listeners[event] = list.filter((l) => l !== listener) as typeof list;
    }
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const list = this.listeners[event];
    if (list) list.forEach((l) => l(payload));
  }

  /** Get the authorization URL to redirect the user to. */
  getAuthorizationUrl(provider: OAuthProvider): string {
    const urls = PROVIDER_URLS[provider];
    const creds = this.config.clientCredentials[provider];
    const scopes = this.config.scopes ?? DEFAULT_SCOPES[provider];

    const params = new URLSearchParams({
      client_id: creds.clientId,
      redirect_uri: this.config.redirectUrl,
      response_type: "code",
      scope: scopes.join(" "),
      state: this.generateState(provider),
    });

    return `${urls.authorize}?${params.toString()}`;
  }

  /** Initiate the OAuth login flow — returns the auth URL for redirect. */
  async login(provider: OAuthProvider): Promise<string> {
    if (!this.config.providers.includes(provider)) {
      const err: AuthError = { code: "INVALID_PROVIDER", message: `Provider "${provider}" is not configured` };
      this.emit("onError", err);
      throw new Error(err.message);
    }

    return this.getAuthorizationUrl(provider);
  }

  /** Handle the OAuth callback — exchange code for tokens and fetch user profile. */
  async handleCallback(provider: OAuthProvider, code: string): Promise<AuthSession> {
    try {
      const urls = PROVIDER_URLS[provider];
      const creds = this.config.clientCredentials[provider];

      // Exchange code for tokens
      const tokenBody = new URLSearchParams({
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        code,
        redirect_uri: this.config.redirectUrl,
        grant_type: "authorization_code",
      });

      const tokenRes = await fetch(urls.token, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: tokenBody.toString(),
      });

      if (!tokenRes.ok) {
        throw new Error(`Token exchange failed: ${tokenRes.status}`);
      }

      const tokenData = await tokenRes.json();

      // Fetch user profile
      const userRes = await fetch(urls.userinfo, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });

      if (!userRes.ok) {
        throw new Error(`User info fetch failed: ${userRes.status}`);
      }

      const userData = await userRes.json();
      this.user = this.normalizeUser(provider, userData);

      const expiresAt = Date.now() + this.config.sessionDuration! * 1000;
      this.session = {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token ?? "",
        expiresAt,
        provider,
      };

      this.emit("onLogin", { userId: this.user.id, provider });
      return this.session;
    } catch (err) {
      const error = err as Error;
      this.emit("onError", { code: "AUTH_FAILED", message: error.message });
      throw err;
    }
  }

  /** End the current session. */
  async logout(): Promise<void> {
    const userId = this.user?.id ?? "unknown";
    this.session = null;
    this.user = null;
    this.emit("onLogout", { userId });
  }

  /** Get the current session or null. */
  getSession(): AuthSession | null {
    if (this.session && Date.now() > this.session.expiresAt) {
      this.session = null;
      this.user = null;
    }
    return this.session;
  }

  /** Get the current user profile or null. */
  getUser(): UserProfile | null {
    return this.user;
  }

  /** Refresh the access token using the refresh token. */
  async refreshToken(): Promise<AuthSession> {
    if (!this.session?.refreshToken) {
      throw new Error("No refresh token available");
    }

    const provider = this.session.provider;
    const urls = PROVIDER_URLS[provider];
    const creds = this.config.clientCredentials[provider];

    const body = new URLSearchParams({
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      refresh_token: this.session.refreshToken,
      grant_type: "refresh_token",
    });

    const res = await fetch(urls.token, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    });

    if (!res.ok) {
      const err: AuthError = { code: "REFRESH_FAILED", message: `Token refresh failed: ${res.status}` };
      this.emit("onError", err);
      throw new Error(err.message);
    }

    const data = await res.json();
    const expiresAt = Date.now() + this.config.sessionDuration! * 1000;

    this.session = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? this.session.refreshToken,
      expiresAt,
      provider,
    };

    this.emit("onTokenRefresh", { expiresAt });
    return this.session;
  }

  /** Create a signed JWT for the current session (for server-side session cookies). */
  async createSessionToken(): Promise<string> {
    if (!this.session || !this.user) {
      throw new Error("No active session");
    }

    const secret = new TextEncoder().encode(this.config.jwtSecret);
    return new jose.SignJWT({
      sub: this.user.id,
      email: this.user.email,
      provider: this.session.provider,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(`${this.config.sessionDuration}s`)
      .sign(secret);
  }

  /** Verify and decode a session JWT. */
  async verifySessionToken(token: string): Promise<jose.JWTPayload> {
    const secret = new TextEncoder().encode(this.config.jwtSecret);
    const { payload } = await jose.jwtVerify(token, secret);
    return payload;
  }

  private normalizeUser(provider: OAuthProvider, data: Record<string, unknown>): UserProfile {
    switch (provider) {
      case "google":
        return {
          id: String(data.id),
          email: String(data.email),
          name: String(data.name),
          avatar: (data.picture as string) ?? null,
          provider,
        };
      case "github":
        return {
          id: String(data.id),
          email: String(data.email ?? ""),
          name: String(data.name ?? data.login),
          avatar: (data.avatar_url as string) ?? null,
          provider,
        };
      case "discord":
        return {
          id: String(data.id),
          email: String(data.email ?? ""),
          name: String(data.username),
          avatar: data.avatar
            ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png`
            : null,
          provider,
        };
    }
  }

  private generateState(provider: OAuthProvider): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return `${provider}:${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
  }
}

export default AuthOAuth;
