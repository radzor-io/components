# How to integrate @radzor/vector-search

## Overview
Index embeddings and search semantically. Combine with @radzor/llm-completion for RAG (Retrieval Augmented Generation).

## Integration Steps

1. **Setup:**
```typescript
import { VectorSearch } from "@radzor/vector-search";
const vs = new VectorSearch({
  provider: "pinecone",
  apiKey: process.env.PINECONE_API_KEY!,
  indexName: "my-docs",
  dimensions: 1536, // text-embedding-3-small
});
```

2. **Index documents (generate embeddings separately):**
```typescript
const embedding = await openai.embeddings.create({
  model: "text-embedding-3-small",
  input: document.text,
});
await vs.index(document.id, embedding.data[0].embedding, {
  title: document.title,
  url: document.url,
  text: document.text.slice(0, 500),
});
```

3. **Search:**
```typescript
const queryEmbedding = await openai.embeddings.create({
  model: "text-embedding-3-small",
  input: userQuery,
});
const results = await vs.search(queryEmbedding.data[0].embedding, { topK: 5 });
```

4. **RAG pipeline with @radzor/llm-completion:**
```typescript
const context = results.map(r => r.metadata.text).join("\n\n");
const answer = await llm.complete(userQuery, {
  systemPrompt: `Answer using this context:\n\n${context}`,
});
```
