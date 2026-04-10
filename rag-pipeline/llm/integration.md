# How to integrate @radzor/rag-pipeline

## Overview
End-to-end Retrieval-Augmented Generation pipeline. Ingests documents by chunking and embedding them into an in-memory vector index, then answers queries by retrieving relevant context and calling an LLM completion endpoint. Zero dependencies — uses native `fetch` against OpenAI-compatible APIs.

## Integration Steps

### TypeScript

1. **Import and create an instance:**
```typescript
import { RagPipeline } from "@radzor/rag-pipeline";

const rag = new RagPipeline({
  embeddingApiKey: process.env.OPENAI_API_KEY!,
  chunkSize: 512,
  overlapSize: 64,
  topK: 5,
});
```

2. **Ingest documents:**
```typescript
const doc = await readFile("knowledge-base.txt", "utf-8");
const { documentId, chunkCount } = await rag.ingest(doc, { source: "kb" });
console.log(`Ingested ${chunkCount} chunks as ${documentId}`);
```

3. **Query the pipeline:**
```typescript
const result = await rag.query("What is the refund policy?");
console.log(result.answer);
console.log(`Confidence: ${result.confidence}`);
console.log(`Sources: ${result.sources.length}`);
```

4. **Listen for events:**
```typescript
rag.on("onQueryComplete", ({ query, answer, confidence }) => {
  console.log(`Q: ${query} → confidence ${confidence.toFixed(2)}`);
});
```

### Python

1. **Create and configure:**
```python
import os
from rag_pipeline import RagPipeline, RagPipelineConfig

rag = RagPipeline(RagPipelineConfig(
    embedding_api_key=os.environ["OPENAI_API_KEY"],
    chunk_size=512,
    overlap_size=64,
    top_k=5,
))
```

2. **Ingest and query:**
```python
with open("knowledge-base.txt") as f:
    result = rag.ingest(f.read(), metadata={"source": "kb"})

answer = rag.query("What is the refund policy?")
print(answer.answer)
print(f"Confidence: {answer.confidence:.2f}")
```

## Environment Variables Required
- `OPENAI_API_KEY` — Used for both embeddings and completions unless separate keys are provided

## Constraints
- Requires Node.js 18+ or a browser with native `fetch`
- The vector index is **in-memory** — data is lost on process restart
- Embedding and completion endpoints must be OpenAI-compatible
- Large documents are split into overlapping chunks; chunk boundaries may split mid-sentence despite best-effort sentence detection
- The completion call uses `temperature: 0.2` by default for factual answers

## Composability
Connections to other Radzor components will be defined in a separate pass.
