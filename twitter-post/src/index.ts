// @radzor/twitter-post — Twitter/X API v2 integration

export interface TwitterPostConfig {
  bearerToken: string;
  apiKey?: string;
  apiSecret?: string;
  accessToken?: string;
  accessSecret?: string;
}

export interface TweetResult {
  tweetId: string;
  text: string;
}

export type EventMap = {
  onTweeted: { tweetId: string; text: string };
  onError: { code: string; message: string };
};

const API_URL = "https://api.twitter.com/2";

export class TwitterPost {
  private config: TwitterPostConfig;
  private listeners: Map<string, Function[]> = new Map();

  constructor(config: TwitterPostConfig) {
    this.config = config;
  }

  on<K extends keyof EventMap>(event: K, handler: (payload: EventMap[K]) => void): void {
    const handlers = this.listeners.get(event) ?? [];
    handlers.push(handler as Function);
    this.listeners.set(event, handlers);
  }

  off<K extends keyof EventMap>(event: K, handler: (payload: EventMap[K]) => void): void {
    const handlers = this.listeners.get(event) ?? [];
    this.listeners.set(event, handlers.filter((h) => h !== handler));
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    for (const handler of this.listeners.get(event) ?? []) handler(payload);
  }

  async tweet(text: string): Promise<TweetResult> {
    return this.postTweet(text);
  }

  async thread(tweets: string[]): Promise<TweetResult[]> {
    const results: TweetResult[] = [];
    let replyToId: string | undefined;

    for (const text of tweets) {
      const result = await this.postTweet(text, replyToId);
      results.push(result);
      replyToId = result.tweetId;
    }

    return results;
  }

  async deleteTweet(tweetId: string): Promise<void> {
    const res = await fetch(`${API_URL}/tweets/${tweetId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this.config.bearerToken}` },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail ?? `Twitter API error: ${res.status}`);
    }
  }

  private async postTweet(text: string, replyToId?: string): Promise<TweetResult> {
    try {
      const body: Record<string, any> = { text };
      if (replyToId) {
        body.reply = { in_reply_to_tweet_id: replyToId };
      }

      const res = await fetch(`${API_URL}/tweets`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.config.bearerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail ?? err.title ?? `Twitter API error: ${res.status}`);
      }

      const data = await res.json();
      const result: TweetResult = {
        tweetId: data.data.id,
        text: data.data.text,
      };
      this.emit("onTweeted", result);
      return result;
    } catch (err: any) {
      this.emit("onError", { code: "TWEET_FAILED", message: err.message });
      throw err;
    }
  }
}
