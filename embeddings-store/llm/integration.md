# How to integrate @radzor/embeddings-store

## Overview
In-memory vector store for embeddings with cosine similarity search. Supports OpenAI and Ollama embedding providers. Ideal for RAG pipelines and semantic search.

## Integration Steps

### TypeScript

1. **Configure**:
```typescript
import { EmbeddingsStore } from "@radzor/embeddings-store";

const store = new EmbeddingsStore({
  provider: "openai",
  apiKey: process.env.OPENAI_API_KEY!,
  model: "text-embedding-3-small",
});
```

2. **Add documents**:
```typescript
await store.add("doc1", "Radzor is a component registry for LLM-driven development");
await store.add("doc2", "OAuth supports Google, GitHub, and Discord providers");
```

3. **Search**:
```typescript
const results = await store.search("authentication providers", 3);
for (const r of results) {
  console.log(`${r.id}: ${r.score.toFixed(3)} — ${r.text}`);
}
```

### Python

1. **Configure**:
```python
from embeddings_store import EmbeddingsStore, EmbeddingsStoreConfig
import os

store = EmbeddingsStore(EmbeddingsStoreConfig(
    provider="openai",
    api_key=os.environ["OPENAI_API_KEY"],
))
```

2. **Add and search**:
```python
store.add("doc1", "Radzor is a component registry")
store.add("doc2", "OAuth supports multiple providers")

results = store.search("authentication", top_k=3)
for r in results:
    print(f"{r.id}: {r.score:.3f} — {r.text}")
```

## Constraints
- In-memory — not persistent across restarts.
- Requires API key for embedding generation.

## Composability
- Search results can feed into `@radzor/llm-completion` as context for RAG.
