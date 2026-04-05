# @radzor/search-index — Usage Examples

## 1. Configure and Index a Product Catalog

```typescript
import { SearchIndex } from "@radzor/search-index";

const search = new SearchIndex({
  provider: "meilisearch",
  host: process.env.MEILISEARCH_HOST!,
  apiKey: process.env.MEILISEARCH_KEY!,
  indexName: "products",
  searchableFields: ["name", "description", "brand"],
  filterableFields: ["category", "price", "inStock", "brand"],
});

// Configure index settings first (do this once at startup)
await search.configure({
  searchableAttributes: ["name", "description", "brand"],
  filterableAttributes: ["category", "price", "inStock", "brand"],
  sortableAttributes: ["price", "createdAt"],
  rankingRules: ["words", "typo", "proximity", "attribute", "sort", "exactness"],
});

// Index your product data
const products = await db.products.findAll();
await search.index(products);
console.log(`Indexed ${products.length} products`);
```

## 2. Full-Text Search with Filters and Facets

```typescript
import { SearchIndex } from "@radzor/search-index";

const search = new SearchIndex({
  provider: "meilisearch",
  host: process.env.MEILISEARCH_HOST!,
  apiKey: process.env.MEILISEARCH_KEY!,
  indexName: "products",
});

search.on("onSearchComplete", ({ query, hits, processingMs }) => {
  console.log(`"${query}" → ${hits} results in ${processingMs}ms`);
});

// Filtered and faceted search
const results = await search.search("wireless headphones", {
  filter: "category = 'audio' AND price < 200 AND inStock = true",
  facets: ["category", "brand"],
  limit: 20,
  offset: 0,
  sort: ["price:asc"],
});

console.log(`Found ${results.total} products`);
console.log(results.hits);       // Array of matching products
console.log(results.facets);     // { category: { audio: 12, ... }, brand: { ... } }
```

## 3. Keep the Index in Sync with Database Changes

```typescript
import { SearchIndex } from "@radzor/search-index";

const search = new SearchIndex({
  provider: "meilisearch",
  host: process.env.MEILISEARCH_HOST!,
  apiKey: process.env.MEILISEARCH_KEY!,
  indexName: "articles",
});

// After creating a new article
async function onArticleCreated(article: Article) {
  await search.index([article]);
}

// After updating a field (partial update merges with existing)
async function onArticleUpdated(id: string, changes: Partial<Article>) {
  await search.update([{ id, ...changes }]);
}

// After deleting
async function onArticleDeleted(id: string) {
  await search.delete([id]);
}
```

## 4. Typesense Provider with Multi-Field Search

```typescript
import { SearchIndex } from "@radzor/search-index";

const search = new SearchIndex({
  provider: "typesense",
  host: process.env.TYPESENSE_HOST!,       // e.g. http://localhost:8108
  apiKey: process.env.TYPESENSE_API_KEY!,
  indexName: "documents",
  searchableFields: ["title", "body", "author"],
  filterableFields: ["tags", "published"],
  primaryKey: "id",
});

await search.index(documents);

const results = await search.search("machine learning", {
  filter: "published:=true",
  facets: ["tags"],
  limit: 10,
});
```

## 5. Re-Index with Progress Tracking

```typescript
import { SearchIndex } from "@radzor/search-index";

const search = new SearchIndex({
  provider: "meilisearch",
  host: process.env.MEILISEARCH_HOST!,
  apiKey: process.env.MEILISEARCH_KEY!,
  indexName: "products",
});

search.on("onIndexed", ({ documentCount, indexName, durationMs }) => {
  console.log(`Indexed ${documentCount} docs into "${indexName}" in ${durationMs}ms`);
});

search.on("onError", ({ operation, message }) => {
  console.error(`Search error during ${operation}: ${message}`);
});

// Full re-index: clear, then index in batches
await search.clearIndex();

const BATCH_SIZE = 500;
let offset = 0;
while (true) {
  const batch = await db.products.findMany({ skip: offset, take: BATCH_SIZE });
  if (batch.length === 0) break;
  await search.index(batch);
  offset += BATCH_SIZE;
}

console.log("Re-index complete");
```
