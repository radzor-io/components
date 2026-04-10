# @radzor/rss-feed — Usage Examples

## Parse an RSS feed from URL
```typescript
import { RssFeed } from "@radzor/rss-feed";

const rss = new RssFeed();

const feed = await rss.parse("https://hnrss.org/frontpage");
console.log(`Feed: ${feed.title}`);
console.log(`Type: ${feed.feedType}`); // "rss" or "atom"
console.log(`Items: ${feed.items.length}`);

for (const item of feed.items.slice(0, 5)) {
  console.log(`  - ${item.title}`);
  console.log(`    ${item.link}`);
  console.log(`    ${item.pubDate ?? "no date"}`);
}
```

## Parse raw XML
```typescript
const rss = new RssFeed();

const xml = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <description>A test feed</description>
    <link>https://example.com</link>
    <item>
      <title>First Post</title>
      <link>https://example.com/post-1</link>
      <description>Hello world</description>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const feed = await rss.parse(xml);
console.log(feed.title);           // "Test Feed"
console.log(feed.items[0].title);  // "First Post"
```

## Generate an RSS feed
```typescript
const rss = new RssFeed();

const xml = rss.generate({
  title: "Engineering Blog",
  description: "Technical articles from the engineering team",
  link: "https://engineering.example.com",
  language: "en-us",
  items: [
    {
      title: "Migrating to TypeScript 5.0",
      link: "https://engineering.example.com/typescript-5",
      description: "Our experience migrating a large codebase to TypeScript 5.0",
      pubDate: new Date("2024-06-15").toUTCString(),
      author: "alice@example.com",
    },
    {
      title: "Building a RAG Pipeline",
      link: "https://engineering.example.com/rag-pipeline",
      description: "How we built our retrieval-augmented generation system",
      pubDate: new Date("2024-06-10").toUTCString(),
      author: "bob@example.com",
    },
  ],
});

// Serve as RSS endpoint
// res.setHeader("Content-Type", "application/rss+xml");
// res.send(xml);
console.log(xml);
```

## Watch a feed for new items
```typescript
const rss = new RssFeed();

rss.on("onNewItem", ({ feedUrl, title, link, pubDate }) => {
  console.log(`[NEW] ${title}`);
  console.log(`  Link: ${link}`);
  console.log(`  Date: ${pubDate}`);
  // Send notification, store in DB, etc.
});

// Watch multiple feeds
await rss.watch("https://blog.example.com/feed.xml", 60000);   // Every minute
await rss.watch("https://news.example.com/rss", 300000);       // Every 5 minutes

console.log("Watching:", rss.getWatchedFeeds());

// Later: stop watching
rss.unwatch("https://blog.example.com/feed.xml");
// Or stop all
rss.unwatchAll();
```

## Aggregate multiple feeds
```typescript
const rss = new RssFeed({ maxItems: 20 });

const feeds = [
  "https://blog.example.com/feed.xml",
  "https://news.example.com/rss",
  "https://updates.example.com/atom.xml",
];

const allItems = [];
for (const url of feeds) {
  const feed = await rss.parse(url);
  for (const item of feed.items) {
    allItems.push({ ...item, source: feed.title });
  }
}

// Sort by date, newest first
allItems.sort((a, b) => {
  const dateA = a.pubDate ? new Date(a.pubDate).getTime() : 0;
  const dateB = b.pubDate ? new Date(b.pubDate).getTime() : 0;
  return dateB - dateA;
});

// Generate an aggregated feed
const aggregated = rss.generate({
  title: "Aggregated Feed",
  description: "Combined feed from multiple sources",
  link: "https://example.com/aggregated",
  items: allItems.slice(0, 50),
});
```

## Parse an Atom feed
```typescript
const rss = new RssFeed();

const feed = await rss.parse("https://github.com/microsoft/TypeScript/releases.atom");
console.log(feed.feedType); // "atom"
console.log(feed.title);
for (const entry of feed.items) {
  console.log(`${entry.title} — ${entry.link}`);
}
```

---

## Python Examples

### Parse a feed
```python
from rss_feed import RssFeed

rss = RssFeed()

feed = rss.parse("https://hnrss.org/frontpage")
print(f"Feed: {feed.title}")
for item in feed.items[:5]:
    print(f"  - {item.title}: {item.link}")
```

### Generate a feed
```python
xml = rss.generate({
    "title": "My Blog",
    "description": "Latest posts",
    "link": "https://blog.example.com",
    "items": [
        {"title": "Hello World", "link": "https://blog.example.com/hello"},
        {"title": "Second Post", "link": "https://blog.example.com/second"},
    ],
})
print(xml)
```

### Watch for new items
```python
rss.on("onNewItem", lambda e: print(f"New: {e['title']} — {e['link']}"))
rss.watch("https://blog.example.com/feed.xml", interval_ms=60000)

# Later
rss.unwatch("https://blog.example.com/feed.xml")
```

### Aggregate feeds
```python
feeds = [
    "https://blog.example.com/feed.xml",
    "https://news.example.com/rss",
]

all_items = []
for url in feeds:
    feed = rss.parse(url)
    all_items.extend(feed.items)

all_items.sort(key=lambda x: x.get("pubDate", ""), reverse=True)
aggregated = rss.generate({
    "title": "Aggregated",
    "description": "Combined feed",
    "link": "https://example.com",
    "items": all_items[:50],
})
```
