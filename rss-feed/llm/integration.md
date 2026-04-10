# How to integrate @radzor/rss-feed

## Overview
Parses, generates, and watches RSS 2.0 and Atom feeds. Supports fetching and parsing feeds from URLs or raw XML, generating valid RSS 2.0 XML from structured data, and polling feeds for new items with event-driven notifications. Zero dependencies — uses native `fetch` and a lightweight built-in XML parser.

## Integration Steps

### TypeScript

1. **Import and create an instance:**
```typescript
import { RssFeed } from "@radzor/rss-feed";

const rss = new RssFeed({
  defaultPollIntervalMs: 300000, // 5 minutes
  maxItems: 50,
});
```

2. **Parse a feed:**
```typescript
const feed = await rss.parse("https://blog.example.com/feed.xml");
console.log(feed.title);
console.log(feed.feedType); // "rss" or "atom"
for (const item of feed.items) {
  console.log(`${item.title} — ${item.link}`);
}
```

3. **Generate an RSS feed:**
```typescript
const xml = rss.generate({
  title: "My Blog",
  description: "Latest posts from my blog",
  link: "https://blog.example.com",
  items: [
    { title: "First Post", link: "https://blog.example.com/post-1", description: "Hello world", pubDate: new Date().toUTCString() },
  ],
});
// Serve `xml` with Content-Type: application/rss+xml
```

4. **Watch for new items:**
```typescript
rss.on("onNewItem", ({ feedUrl, title, link }) => {
  console.log(`New item in ${feedUrl}: ${title} — ${link}`);
});

await rss.watch("https://blog.example.com/feed.xml", 60000); // Poll every minute
```

### Python

1. **Parse and watch:**
```python
from rss_feed import RssFeed, RssFeedConfig

rss = RssFeed(RssFeedConfig(default_poll_interval_ms=300000))

feed = rss.parse("https://blog.example.com/feed.xml")
print(feed.title)
for item in feed.items:
    print(f"{item.title}: {item.link}")
```

2. **Generate:**
```python
xml = rss.generate({
    "title": "My Blog",
    "description": "Latest posts",
    "link": "https://blog.example.com",
    "items": [{"title": "Post 1", "link": "https://blog.example.com/1"}],
})
```

## Environment Variables Required
None.

## Constraints
- Uses native `fetch` — requires Node.js 18+
- XML parsing is regex-based, not a full DOM parser — handles well-formed RSS 2.0 and Atom but may fail on exotic XML constructs
- Feed watching uses `setInterval`-based polling — not suitable for watching hundreds of feeds simultaneously
- `pubDate` parsing relies on `Date()` constructor; non-standard date formats may not parse correctly

## Composability
Connections to other Radzor components will be defined in a separate pass.
