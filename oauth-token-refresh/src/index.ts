// @radzor/oauth-token-refresh — Automatic OAuth 2.0 token refresh
export interface OAuthTokenRefreshConfig {
  clientId: string;
  clientSecret: string;
  tokenEndpoint?: string;
  provider?: "google" | "github" | "discord" | "stripe" | "custom";
  refreshBuffer?: number;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  tokenType?: string;
}

export interface TokenMeta {
  accessToken: string;
  expiresAt: number;
  scope: string;
  tokenType: string;
}

export type EventMap = {
  onRefreshed: { expiresAt: number; scope: string };
  onExpired: { provider: string };
  onError: { code: string; message: string; provider: string };
};

export type Listener<T> = (payload: T) => void;

const PROVIDER_ENDPOINTS: Record<string, string> = {
  google: "https://oauth2.googleapis.com/token",
  github: "https://github.com/login/oauth/access_token",
  discord: "https://discord.com/api/oauth2/token",
  stripe: "https://api.stripe.com/v1/oauth/token",
};

const PROVIDER_REVOKE_ENDPOINTS: Record<string, string> = {
  google: "https://oauth2.googleapis.com/revoke",
  discord: "https://discord.com/api/oauth2/token/revoke",
};

export class OAuthTokenRefresh {
  private config: Required<OAuthTokenRefreshConfig>;
  private store: Map<string, TokenSet> = new Map();
  private listeners: Map<string, Listener<unknown>[]> = new Map();

  constructor(config: OAuthTokenRefreshConfig) {
    const provider = config.provider ?? "custom";

    let tokenEndpoint = config.tokenEndpoint;
    if (!tokenEndpoint && provider !== "custom") {
      tokenEndpoint = PROVIDER_ENDPOINTS[provider];
    }
    if (!tokenEndpoint) {
      tokenEndpoint = "";
    }

    this.config = {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      tokenEndpoint,
      provider,
      refreshBuffer: config.refreshBuffer ?? 300,
    };
  }

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener as Listener<unknown>);
    this.listeners.set(event, listeners);
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    const listeners = this.listeners.get(event) ?? [];
    this.listeners.set(
      event,
      listeners.filter((l) => l !== (listener as Listener<unknown>))
    );
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const listeners = this.listeners.get(event) ?? [];
    for (const listener of listeners) {
      listener(payload as unknown);
    }
  }

  async store(userId: string, tokens: TokenSet): Promise<void> {
    this.store.set(userId, { ...tokens });
  }

  async isExpired(userId: string): Promise<boolean> {
    const tokens = this.store.get(userId);
    if (!tokens) return true;

    // GitHub tokens don't expire
    if (this.config.provider === "github") return false;

    if (!tokens.expiresAt) return false;

    const bufferMs = this.config.refreshBuffer * 1000;
    return Date.now() >= tokens.expiresAt - bufferMs;
  }

  async getToken(userId: string): Promise<string> {
    const tokens = this.store.get(userId);
    if (!tokens) {
      throw new Error(`No tokens stored for user "${userId}". Call store() after initial OAuth.`);
    }

    const expired = await this.isExpired(userId);
    if (!expired) {
      return tokens.accessToken;
    }

    if (!tokens.refreshToken) {
      this.emit("onExpired", { provider: this.config.provider });
      throw new Error(`Token expired and no refresh token available for user "${userId}".`);
    }

    try {
      const meta = await this.refresh(tokens.refreshToken);
      this.store.set(userId, {
        ...tokens,
        accessToken: meta.accessToken,
        expiresAt: meta.expiresAt,
        scope: meta.scope,
        tokenType: meta.tokenType,
      });
      return meta.accessToken;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // If refresh_token is invalid or expired
      if (message.includes("invalid_grant") || message.includes("Token has been expired")) {
        this.emit("onExpired", { provider: this.config.provider });
      } else {
        this.emit("onError", {
          code: "REFRESH_FAILED",
          message,
          provider: this.config.provider,
        });
      }
      throw err;
    }
  }

  async refresh(refreshToken: string): Promise<TokenMeta> {
    // GitHub tokens don't expire, so refresh is a no-op
    if (this.config.provider === "github") {
      throw new Error("GitHub OAuth tokens do not expire. Refresh is not applicable.");
    }

    if (!this.config.tokenEndpoint) {
      throw new Error("tokenEndpoint is required. Set provider or tokenEndpoint in config.");
    }

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
    });

    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
    };

    if (this.config.provider === "github") {
      headers["Accept"] = "application/json";
    }

    const response = await fetch(this.config.tokenEndpoint, {
      method: "POST",
      headers,
      body: body.toString(),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Token refresh failed (${response.status}): ${text}`);
    }

    let data: Record<string, unknown>;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      data = await response.json() as Record<string, unknown>;
    } else {
      const text = await response.text();
      data = Object.fromEntries(new URLSearchParams(text).entries());
    }

    if (data.error) {
      throw new Error(`OAuth error: ${data.error} — ${data.error_description ?? ""}`);
    }

    const expiresAt =
      typeof data.expires_in === "number"
        ? Date.now() + data.expires_in * 1000
        : Date.now() + 3600 * 1000; // default 1 hour

    const meta: TokenMeta = {
      accessToken: String(data.access_token),
      expiresAt,
      scope: String(data.scope ?? ""),
      tokenType: String(data.token_type ?? "Bearer"),
    };

    this.emit("onRefreshed", { expiresAt: meta.expiresAt, scope: meta.scope });
    return meta;
  }

  async revoke(userId: string): Promise<void> {
    const tokens = this.store.get(userId);
    if (!tokens) return;

    const revokeEndpoint = PROVIDER_REVOKE_ENDPOINTS[this.config.provider];

    if (revokeEndpoint && tokens.refreshToken) {
      try {
        const body = new URLSearchParams({ token: tokens.refreshToken });
        if (this.config.provider === "discord") {
          body.set("client_id", this.config.clientId);
          body.set("client_secret", this.config.clientSecret);
        }

        await fetch(revokeEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.emit("onError", {
          code: "REVOKE_FAILED",
          message,
          provider: this.config.provider,
        });
      }
    }

    this.store.delete(userId);
  }
}
