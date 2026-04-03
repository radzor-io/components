# @radzor/web-scraper — Usage Examples

## TypeScript

### Extract product data
```typescript
import { WebScraper } from "@radzor/web-scraper";

const scraper = new WebScraper();
const result = await scraper.scrape("https://store.example.com/products", {
  names: ".product-name",
  prices: ".price",
  descriptions: ".description",
});

result.data.names.forEach((name, i) => {
  console.log(`${name}: ${result.data.prices[i]}`);
});
```

### Fetch raw HTML
```typescript
const html = await scraper.fetchHtml("https://example.com");
console.log(html.length, "characters");
```

### Event monitoring
```typescript
scraper.on("onPageFetched", ({ url, size }) => {
  console.log(`Fetched ${url} (${size} bytes)`);
});
```

## Python

### Extract headlines
```python
from web_scraper import WebScraper

scraper = WebScraper()
result = scraper.scrape("https://news.example.com", {
    "headlines": "h2",
    "summaries": ".summary",
})

for headline in result.data["headlines"]:
    print(headline)
```

### Rate-limited crawl
```python
from web_scraper import WebScraperConfig

scraper = WebScraper(WebScraperConfig(rate_limit=3.0))

urls = ["https://example.com/page/1", "https://example.com/page/2"]
for url in urls:
    result = scraper.scrape(url, {"content": ".article-body"})
    print(f"{url}: {len(result.data['content'])} items")
```
