# How to integrate @radzor/search-index

## Overview
Full-text search with typo tolerance, facets, and filters using Meilisearch or Typesense.

## Integration Steps

1. **Setup:**
```typescript
import { SearchIndex } from "@radzor/search-index";
const search = new SearchIndex({
  provider: "meilisearch",
  host: process.env.MEILISEARCH_HOST!,
  apiKey: process.env.MEILISEARCH_KEY!,
  indexName: "products",
  searchableFields: ["name", "description"],
  filterableFields: ["category", "price", "inStock"],
});
```

2. **Configure and index:**
```typescript
await search.configure({
  searchableAttributes: ["name", "description"],
  filterableAttributes: ["category", "price"],
  rankingRules: ["words", "typo", "proximity", "attribute", "sort", "exactness"],
});

await search.index(products); // products is an array of objects with an "id" field
```

3. **Search with filters:**
```typescript
const results = await search.search("wireless headphones", {
  filter: "category = 'audio' AND price < 200",
  facets: ["category", "brand"],
  limit: 20,
});
console.log(results.hits, results.facetDistribution);
```

4. **Keep index in sync on data changes:**
```typescript
await search.update([{ id: product.id, price: newPrice }]); // partial update
await search.delete([deletedProductId]);
```
