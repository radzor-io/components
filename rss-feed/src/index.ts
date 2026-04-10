// @radzor/rss-feed — Parse, generate, and watch RSS/Atom feeds

export interface RssFeedConfig {
  userAgent?: string;
  defaultPollIntervalMs?: number;
  maxItems?: number;
}

export interface FeedItem {
  title: string;
  link: string;
  description?: string;
  pubDate?: string;
  guid?: string;
  author?: string;
}

export interface FeedData {
  title: string;
  description?: string;
  link?: string;
  feedUrl: string;
  feedType: "rss" | "atom";
  lastUpdated: string;
  items: FeedItem[];
}

export interface GenerateFeedOptions {
  title: string;
  description: string;
  link: string;
  items: FeedItem[];
  language?: string;
  lastBuildDate?: string;
}

interface WatchState {
  url: string;
  intervalMs: number;
  timer: ReturnType<typeof setInterval>;
  knownGuids: Set<string>;
}

export type EventMap = {
  onNewItem: { feedUrl: string; title: string; link: string; pubDate: string };
};

export type Listener<T> = (event: T) => void;

export class RssFeed {
  private config: {
    userAgent: string;
    defaultPollIntervalMs: number;
    maxItems: number;
  };
  private listeners: { [K in keyof EventMap]?: Listener<EventMap[K]>[] } = {};
  private watches: Map<string, WatchState> = new Map();

  constructor(config?: RssFeedConfig) {
    this.config = {
      userAgent: config?.userAgent ?? "RadzorRSSFeed/0.1",
      defaultPollIntervalMs: config?.defaultPollIntervalMs ?? 300000,
      maxItems: config?.maxItems ?? 100,
    };
  }

  on<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event]!.push(listener);
  }

  off<K extends keyof EventMap>(event: K, listener: Listener<EventMap[K]>): void {
    const list = this.listeners[event];
    if (list) this.listeners[event] = list.filter((l) => l !== listener) as typeof list;
  }

  private emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const list = this.listeners[event];
    if (list) list.forEach((l) => l(payload));
  }

  /** Parse an RSS/Atom feed from a URL or raw XML string. */
  async parse(urlOrXml: string): Promise<FeedData> {
    let xml: string;
    let feedUrl: string;

    if (urlOrXml.trimStart().startsWith("<")) {
      xml = urlOrXml;
      feedUrl = "";
    } else {
      feedUrl = urlOrXml;
      const res = await fetch(urlOrXml, {
        headers: { "User-Agent": this.config.userAgent, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
      });
      if (!res.ok) {
        throw new Error(`Failed to fetch feed: HTTP ${res.status}`);
      }
      xml = await res.text();
    }

    const isAtom = xml.includes("<feed") && xml.includes("xmlns=\"http://www.w3.org/2005/Atom\"");
    return isAtom ? this.parseAtom(xml, feedUrl) : this.parseRss(xml, feedUrl);
  }

  /** Generate an RSS 2.0 XML feed from structured data. */
  generate(options: GenerateFeedOptions): string {
    const escXml = (s: string) => s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

    const itemsXml = options.items.map((item) => {
      const parts = ["    <item>"];
      parts.push(`      <title>${escXml(item.title)}</title>`);
      parts.push(`      <link>${escXml(item.link)}</link>`);
      if (item.description) parts.push(`      <description>${escXml(item.description)}</description>`);
      if (item.pubDate) parts.push(`      <pubDate>${item.pubDate}</pubDate>`);
      if (item.guid) parts.push(`      <guid>${escXml(item.guid)}</guid>`);
      else parts.push(`      <guid>${escXml(item.link)}</guid>`);
      if (item.author) parts.push(`      <author>${escXml(item.author)}</author>`);
      parts.push("    </item>");
      return parts.join("\n");
    }).join("\n");

    const lastBuild = options.lastBuildDate ?? new Date().toUTCString();
    const lang = options.language ? `\n    <language>${escXml(options.language)}</language>` : "";

    return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${escXml(options.title)}</title>
    <description>${escXml(options.description)}</description>
    <link>${escXml(options.link)}</link>
    <lastBuildDate>${lastBuild}</lastBuildDate>${lang}
${itemsXml}
  </channel>
</rss>`;
  }

  /** Start polling a feed for new items. */
  async watch(url: string, intervalMs?: number): Promise<void> {
    if (this.watches.has(url)) {
      throw new Error(`Already watching "${url}". Call unwatch() first.`);
    }

    const pollInterval = intervalMs ?? this.config.defaultPollIntervalMs;

    // Initial fetch to establish baseline
    const initialFeed = await this.parse(url);
    const knownGuids = new Set<string>();
    for (const item of initialFeed.items) {
      knownGuids.add(item.guid ?? item.link);
    }

    const timer = setInterval(async () => {
      try {
        const feed = await this.parse(url);
        for (const item of feed.items) {
          const id = item.guid ?? item.link;
          if (!knownGuids.has(id)) {
            knownGuids.add(id);
            this.emit("onNewItem", {
              feedUrl: url,
              title: item.title,
              link: item.link,
              pubDate: item.pubDate ?? new Date().toISOString(),
            });
          }
        }
      } catch {
        // Silently skip failed polls — will retry next interval
      }
    }, pollInterval);

    this.watches.set(url, { url, intervalMs: pollInterval, timer, knownGuids });
  }

  /** Stop watching a feed URL. */
  unwatch(url: string): boolean {
    const state = this.watches.get(url);
    if (!state) return false;
    clearInterval(state.timer);
    this.watches.delete(url);
    return true;
  }

  /** Get list of currently watched feed URLs. */
  getWatchedFeeds(): string[] {
    return Array.from(this.watches.keys());
  }

  /** Stop watching all feeds. */
  unwatchAll(): void {
    for (const [url] of this.watches) {
      this.unwatch(url);
    }
  }

  // ─── RSS 2.0 Parser ───────────────────────────────────

  private parseRss(xml: string, feedUrl: string): FeedData {
    const title = this.extractTag(xml, "title") ?? "Untitled Feed";
    const description = this.extractTag(xml, "description");
    const link = this.extractTag(xml, "link");
    const lastBuildDate = this.extractTag(xml, "lastBuildDate") ?? this.extractTag(xml, "pubDate");

    const items = this.extractItems(xml, "item");

    return {
      title,
      description: description ?? undefined,
      link: link ?? undefined,
      feedUrl,
      feedType: "rss",
      lastUpdated: lastBuildDate ? new Date(lastBuildDate).toISOString() : new Date().toISOString(),
      items: items.slice(0, this.config.maxItems),
    };
  }

  // ─── Atom Parser ──────────────────────────────────────

  private parseAtom(xml: string, feedUrl: string): FeedData {
    const title = this.extractTag(xml, "title") ?? "Untitled Feed";
    const subtitle = this.extractTag(xml, "subtitle");
    const updated = this.extractTag(xml, "updated");

    // Extract link href from <link> elements
    const linkMatch = xml.match(/<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/);
    const link = linkMatch ? linkMatch[1] : this.extractTag(xml, "link");

    const items = this.extractAtomEntries(xml);

    return {
      title,
      description: subtitle ?? undefined,
      link: link ?? undefined,
      feedUrl,
      feedType: "atom",
      lastUpdated: updated ? new Date(updated).toISOString() : new Date().toISOString(),
      items: items.slice(0, this.config.maxItems),
    };
  }

  // ─── XML helpers ──────────────────────────────────────

  private extractTag(xml: string, tag: string): string | null {
    // Match the first occurrence, avoiding nested matches
    const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
    const match = xml.match(regex);
    if (!match) return null;
    return this.decodeXmlEntities(match[1].trim());
  }

  private extractItems(xml: string, tag: string): FeedItem[] {
    const items: FeedItem[] = [];
    const regex = new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`, "gi");
    let match: RegExpExecArray | null;

    while ((match = regex.exec(xml)) !== null) {
      const block = match[0];
      const title = this.extractTag(block, "title") ?? "";
      const link = this.extractTag(block, "link") ?? "";
      const description = this.extractTag(block, "description");
      const pubDate = this.extractTag(block, "pubDate");
      const guid = this.extractTag(block, "guid");
      const author = this.extractTag(block, "author") ?? this.extractTag(block, "dc:creator");

      items.push({
        title,
        link,
        description: description ?? undefined,
        pubDate: pubDate ? new Date(pubDate).toISOString() : undefined,
        guid: guid ?? link,
        author: author ?? undefined,
      });
    }

    return items;
  }

  private extractAtomEntries(xml: string): FeedItem[] {
    const items: FeedItem[] = [];
    const regex = /<entry[\s>][\s\S]*?<\/entry>/gi;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(xml)) !== null) {
      const block = match[0];
      const title = this.extractTag(block, "title") ?? "";

      // Atom <link href="..."/>
      const linkMatch = block.match(/<link[^>]*href=["']([^"']+)["']/);
      const link = linkMatch ? linkMatch[1] : "";

      const summary = this.extractTag(block, "summary") ?? this.extractTag(block, "content");
      const updated = this.extractTag(block, "updated") ?? this.extractTag(block, "published");
      const id = this.extractTag(block, "id");
      const authorBlock = block.match(/<author>[\s\S]*?<\/author>/i);
      const authorName = authorBlock ? this.extractTag(authorBlock[0], "name") : null;

      items.push({
        title,
        link,
        description: summary ?? undefined,
        pubDate: updated ? new Date(updated).toISOString() : undefined,
        guid: id ?? link,
        author: authorName ?? undefined,
      });
    }

    return items;
  }

  private decodeXmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  }
}

export default RssFeed;
