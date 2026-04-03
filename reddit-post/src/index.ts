// @radzor/reddit-post — Reddit API integration

const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const API_BASE = "https://oauth.reddit.com";

// ---- types ----

export interface RedditConfig {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
}

export interface RedditPost {
  id: string;
  name: string;
  url: string;
  title: string;
}

export interface RedditComment {
  id: string;
  name: string;
  body: string;
}

type EventMap = {
  onPostCreated: RedditPost;
  onError: { code: string; message: string };
};

// ---- implementation ----

export class RedditClient {
  private clientId: string;
  private clientSecret: string;
  private username: string;
  private password: string;
  private accessToken: string | null = null;
  private tokenExpiry = 0;
  private listeners: { [K in keyof EventMap]?: Array<(payload: EventMap[K]) => void> } = {};

  constructor(config: RedditConfig) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.username = config.username;
    this.password = config.password;
  }

  on<K extends keyof EventMap>(event: K, listener: (payload: EventMap[K]) => void): void {
    (this.listeners[event] ??= []).push(listener);
  }

  off<K extends keyof EventMap>(event: K, listener: (payload: EventMap[K]) => void): void {
    const arr = this.listeners[event];
    if (arr) this.listeners[event] = arr.filter((l) => l !== listener) as any;
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    this.listeners[event]?.forEach((l) => l(payload));
  }

  private async authenticate(): Promise<string> {
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    const creds = btoa(`${this.clientId}:${this.clientSecret}`);
    const body = new URLSearchParams({
      grant_type: "password",
      username: this.username,
      password: this.password,
    });

    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${creds}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "radzor:reddit-post:v0.1.0",
      },
      body: body.toString(),
    });

    const json = await res.json();
    if (json.error) throw new Error(`Reddit auth error: ${json.error}`);

    this.accessToken = json.access_token;
    this.tokenExpiry = Date.now() + json.expires_in * 1000;
    return this.accessToken!;
  }

  private async apiCall(method: string, path: string, body?: Record<string, string>): Promise<any> {
    const token = await this.authenticate();
    const options: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "radzor:reddit-post:v0.1.0",
        "Content-Type": "application/x-www-form-urlencoded",
      },
    };
    if (body) {
      options.body = new URLSearchParams(body).toString();
    }

    const res = await fetch(`${API_BASE}${path}`, options);
    return res.json();
  }

  async submitText(subreddit: string, title: string, text: string): Promise<RedditPost> {
    try {
      const json = await this.apiCall("POST", "/api/submit", {
        sr: subreddit,
        kind: "self",
        title,
        text,
      });

      const data = json.json?.data;
      const post: RedditPost = {
        id: data?.id || "",
        name: data?.name || "",
        url: data?.url || "",
        title,
      };
      this.emit("onPostCreated", post);
      return post;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "SUBMIT_ERROR", message });
      throw err;
    }
  }

  async submitLink(subreddit: string, title: string, url: string): Promise<RedditPost> {
    try {
      const json = await this.apiCall("POST", "/api/submit", {
        sr: subreddit,
        kind: "link",
        title,
        url,
      });

      const data = json.json?.data;
      const post: RedditPost = {
        id: data?.id || "",
        name: data?.name || "",
        url: data?.url || url,
        title,
      };
      this.emit("onPostCreated", post);
      return post;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "SUBMIT_ERROR", message });
      throw err;
    }
  }

  async addComment(thingId: string, text: string): Promise<RedditComment> {
    try {
      const json = await this.apiCall("POST", "/api/comment", {
        thing_id: thingId,
        text,
      });

      const data = json.json?.data?.things?.[0]?.data;
      return {
        id: data?.id || "",
        name: data?.name || "",
        body: data?.body || text,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.emit("onError", { code: "COMMENT_ERROR", message });
      throw err;
    }
  }
}
