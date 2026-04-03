# @radzor/embeddings-store — Usage Examples

## TypeScript

### RAG pipeline
```typescript
import { EmbeddingsStore } from "@radzor/embeddings-store";
import { LlmCompletion } from "@radzor/llm-completion";

const store = new EmbeddingsStore({ provider: "openai", apiKey: process.env.OPENAI_API_KEY! });
const llm = new LlmCompletion({ provider: "openai", apiKey: process.env.OPENAI_API_KEY!, model: "gpt-4o" });

// Index documents
for (const doc of documents) {
  await store.add(doc.id, doc.content, { title: doc.title });
}

// Query with RAG
const results = await store.search("How to set up payments?", 3);
const context = results.map((r) => r.text).join("\n\n");

const answer = await llm.complete(`Context:\n${context}\n\nQuestion: How to set up payments?`);
console.log(answer.content);
```

### Semantic search API
```typescript
app.get("/api/search", async (req, res) => {
  const results = await store.search(req.query.q as string, 10);
  res.json(results.map((r) => ({ id: r.id, score: r.score, text: r.text })));
});
```

### With Ollama (local)
```typescript
const store = new EmbeddingsStore({
  provider: "ollama",
  model: "nomic-embed-text",
});

await store.add("local-doc", "This runs entirely on your machine");
```

## Python

### RAG pipeline
```python
from embeddings_store import EmbeddingsStore, EmbeddingsStoreConfig
import os

store = EmbeddingsStore(EmbeddingsStoreConfig(
    provider="openai",
    api_key=os.environ["OPENAI_API_KEY"],
))

# Index
for doc in documents:
    store.add(doc["id"], doc["content"], {"title": doc["title"]})

# Search
results = store.search("How to set up payments?", top_k=3)
context = "\n\n".join(r.text for r in results)
print(context)
```

### Flask search endpoint
```python
from flask import Flask, request, jsonify

app = Flask(__name__)

@app.route("/api/search")
def search():
    q = request.args.get("q", "")
    results = store.search(q, top_k=10)
    return jsonify([{"id": r.id, "score": r.score, "text": r.text} for r in results])
```

### With Ollama
```python
store = EmbeddingsStore(EmbeddingsStoreConfig(
    provider="ollama",
    model="nomic-embed-text",
))

store.add("doc1", "Runs locally with Ollama")
results = store.search("local embeddings")
```
