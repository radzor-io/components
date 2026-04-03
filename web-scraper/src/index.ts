// @radzor/web-scraper — Web page scraping with CSS selectors

interface WebScraperConfig {
  userAgent?: string;
  timeout?: number;
  rateLimit?: number;
}

interface ScrapeResult {
  url: string;
  status: number;
  data: Record<string, string[]>;
  html: string;
}

type EventMap = {
  onPageFetched: { url: string; status: number; size: number };
  onError: { code: string; message: string; url: string };
};

export class WebScraper {
  private config: Required<WebScraperConfig>;
  private listeners: Map<string, Function[]> = new Map();
  private lastRequest = 0;

  constructor(config?: WebScraperConfig) {
    this.config = {
      userAgent: config?.userAgent ?? "RadzorBot/1.0",
      timeout: config?.timeout ?? 30000,
      rateLimit: config?.rateLimit ?? 1000,
    };
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

  async fetchHtml(url: string): Promise<string> {
    await this.respectRateLimit();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.config.timeout);

      const res = await fetch(url, {
        headers: { "User-Agent": this.config.userAgent },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const html = await res.text();
      this.emit("onPageFetched", { url, status: res.status, size: html.length });
      return html;
    } catch (err: any) {
      this.emit("onError", { code: "FETCH_FAILED", message: err.message, url });
      throw err;
    }
  }

  async scrape(url: string, selectors: Record<string, string>): Promise<ScrapeResult> {
    const html = await this.fetchHtml(url);
    const data: Record<string, string[]> = {};

    for (const [name, selector] of Object.entries(selectors)) {
      data[name] = this.extractBySelector(html, selector);
    }

    return { url, status: 200, data, html };
  }

  // Simple CSS selector matching using regex (handles tag, .class, #id, tag.class)
  private extractBySelector(html: string, selector: string): string[] {
    const results: string[] = [];

    let tagPattern: RegExp;

    if (selector.startsWith("#")) {
      // ID selector
      const id = selector.slice(1);
      tagPattern = new RegExp(`<([a-z][a-z0-9]*)\\s[^>]*id=["']${this.escapeRegex(id)}["'][^>]*>(.*?)</\\1>`, "gis");
    } else if (selector.startsWith(".")) {
      // Class selector
      const cls = selector.slice(1);
      tagPattern = new RegExp(`<([a-z][a-z0-9]*)\\s[^>]*class=["'][^"']*\\b${this.escapeRegex(cls)}\\b[^"']*["'][^>]*>(.*?)</\\1>`, "gis");
    } else if (selector.includes(".")) {
      // tag.class
      const [tag, cls] = selector.split(".");
      tagPattern = new RegExp(`<${this.escapeRegex(tag)}\\s[^>]*class=["'][^"']*\\b${this.escapeRegex(cls)}\\b[^"']*["'][^>]*>(.*?)</${this.escapeRegex(tag)}>`, "gis");
    } else {
      // Tag selector
      tagPattern = new RegExp(`<${this.escapeRegex(selector)}[^>]*>(.*?)</${this.escapeRegex(selector)}>`, "gis");
    }

    let match;
    while ((match = tagPattern.exec(html)) !== null) {
      const content = match[match.length === 3 ? 2 : 1];
      results.push(this.stripTags(content).trim());
    }

    return results;
  }

  private stripTags(html: string): string {
    return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  }

  private escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private async respectRateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequest;
    if (elapsed < this.config.rateLimit) {
      await new Promise((r) => setTimeout(r, this.config.rateLimit - elapsed));
    }
    this.lastRequest = Date.now();
  }
}
