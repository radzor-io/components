# How to integrate @radzor/web-scraper

## Overview
Web page scraping with CSS selector extraction and rate limiting. Fetches HTML and extracts structured data.

## Integration Steps

### TypeScript
```typescript
import { WebScraper } from "@radzor/web-scraper";

const scraper = new WebScraper({ rateLimit: 2000 });

const result = await scraper.scrape("https://example.com", {
  title: "h1",
  links: "a",
  paragraphs: "p",
});
console.log(result.data.title);  // ["Example Domain"]
```

### Python
```python
from web_scraper import WebScraper, WebScraperConfig

scraper = WebScraper(WebScraperConfig(rate_limit=2.0))

result = scraper.scrape("https://example.com", {
    "title": "h1",
    "links": "a",
    "paragraphs": "p",
})
print(result.data["title"])
```

## Constraints
- Uses regex-based CSS selector matching (supports tag, .class, #id, tag.class).
- For complex selectors, use a dedicated HTML parser.
- Respect robots.txt and rate limits.

## Composability
- Scraped text can feed into `@radzor/embeddings-store` for indexing.
