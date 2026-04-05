# @radzor/vector-search — Usage Examples

## 1. Index Documents for a RAG Pipeline (Pinecone)

```typescript
import { VectorSearch } from "@radzor/vector-search";
import OpenAI from "openai";

const vs = new VectorSearch({
  provider: "pinecone",
  apiKey: process.env.PINECONE_API_KEY!,
  indexName: "my-docs",
  dimensions: 1536, // text-embedding-3-small
  metric: "cosine",
});

const openai = new OpenAI();

// Index a batch of documents
const documents = await db.articles.findAll();

const items = await Promise.all(
  documents.map(async (doc) => {
    const embedding = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: doc.content,
    });
    return {
      id: doc.id,
      vector: embedding.data[0].embedding,
      metadata: { title: doc.title, url: doc.url, text: doc.content.slice(0, 500) },
    };
  })
);

await vs.indexBatch(items);
console.log(`Indexed ${items.length} documents`);
```

## 2. Semantic Search Query

```typescript
import { VectorSearch } from "@radzor/vector-search";
import OpenAI from "openai";

const vs = new VectorSearch({
  provider: "pinecone",
  apiKey: process.env.PINECONE_API_KEY!,
  indexName: "my-docs",
  dimensions: 1536,
  topK: 5,
});

const openai = new OpenAI();

async function semanticSearch(query: string) {
  const embedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });

  const results = await vs.search(embedding.data[0].embedding, 5);

  return results.map((r) => ({
    title: r.metadata.title,
    url: r.metadata.url,
    score: r.score,
  }));
}

const hits = await semanticSearch("how do I handle auth tokens securely?");
console.log(hits);
```

## 3. RAG Pipeline — Semantic Search + LLM Completion

```typescript
import { VectorSearch } from "@radzor/vector-search";
import OpenAI from "openai";

const vs = new VectorSearch({
  provider: "pinecone",
  apiKey: process.env.PINECONE_API_KEY!,
  indexName: "knowledge-base",
  dimensions: 1536,
});

const openai = new OpenAI();

async function answerQuestion(userQuestion: string): Promise<string> {
  // Step 1: embed the question
  const embedding = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: userQuestion,
  });

  // Step 2: retrieve relevant context
  const results = await vs.search(embedding.data[0].embedding, 5);
  const context = results.map((r) => r.metadata.text as string).join("\n\n");

  // Step 3: generate grounded answer
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: `Answer using only this context:\n\n${context}` },
      { role: "user", content: userQuestion },
    ],
  });

  return completion.choices[0].message.content ?? "";
}
```

## 4. Filtered Semantic Search (Pinecone Metadata Filters)

```typescript
import { VectorSearch } from "@radzor/vector-search";

const vs = new VectorSearch({
  provider: "pinecone",
  apiKey: process.env.PINECONE_API_KEY!,
  indexName: "products",
  dimensions: 1536,
});

vs.on("onSearchComplete", ({ resultCount, durationMs }) => {
  console.log(`Found ${resultCount} results in ${durationMs}ms`);
});

// Search only within a specific category using Pinecone metadata filters
const results = await vs.search(queryEmbedding, 10, {
  category: { $eq: "electronics" },
  inStock: { $eq: true },
  price: { $lte: 200 },
});

console.log(results.map((r) => ({ id: r.id, score: r.score, name: r.metadata.name })));
```

## 5. Index with Qdrant and Monitor Stats

```typescript
import { VectorSearch } from "@radzor/vector-search";

const vs = new VectorSearch({
  provider: "qdrant",
  host: process.env.QDRANT_HOST!,  // e.g. http://localhost:6333
  apiKey: process.env.QDRANT_API_KEY,
  indexName: "embeddings",
  dimensions: 768,
  metric: "cosine",
  topK: 10,
});

vs.on("onIndexed", ({ id, dimensions }) => {
  console.log(`Indexed vector ${id} (${dimensions}d)`);
});

vs.on("onError", ({ code, message, provider }) => {
  console.error(`[${provider}] ${code}: ${message}`);
});

// Index a single vector
await vs.index("doc-001", myEmbedding, {
  title: "Introduction to Vector Databases",
  category: "databases",
});

// Delete a stale vector
await vs.delete("doc-000");

// Check index health
const stats = await vs.getStats();
console.log(`Index contains ${stats.totalVectors} vectors (${stats.dimensions}d)`);
```
