# @radzor/rag-pipeline — Usage Examples

## Basic ingest and query
```typescript
import { RagPipeline } from "@radzor/rag-pipeline";

const rag = new RagPipeline({
  embeddingApiKey: process.env.OPENAI_API_KEY!,
});

await rag.ingest(`
  Our refund policy allows returns within 30 days of purchase.
  Items must be in original condition. Digital products are non-refundable.
  Contact support@example.com for refund requests.
`);

const result = await rag.query("Can I return a digital product?");
console.log(result.answer);
// "No, digital products are non-refundable according to the policy."
console.log(result.confidence); // 0.87
```

## Multi-document ingestion with metadata
```typescript
const rag = new RagPipeline({
  embeddingApiKey: process.env.OPENAI_API_KEY!,
  chunkSize: 300,
  overlapSize: 50,
});

await rag.ingest(hrPolicyText, { department: "hr", type: "policy" });
await rag.ingest(engineeringDocsText, { department: "engineering", type: "docs" });
await rag.ingest(salesPlaybookText, { department: "sales", type: "playbook" });

const result = await rag.query("What is the PTO policy?");
// Sources will include metadata showing which document each chunk came from
for (const source of result.sources) {
  console.log(`[${source.metadata?.department}] score=${source.score.toFixed(3)}: ${source.text.slice(0, 80)}...`);
}
```

## Custom system prompt for domain-specific answers
```typescript
const rag = new RagPipeline({
  embeddingApiKey: process.env.OPENAI_API_KEY!,
  completionModel: "gpt-4o",
  topK: 3,
});

await rag.ingest(medicalGuidelinesText);

const result = await rag.query(
  "What are the recommended treatments for hypertension?",
  "You are a medical information assistant. Always include disclaimers that this is not medical advice. Cite source numbers."
);
console.log(result.answer);
```

## Event-driven logging
```typescript
const rag = new RagPipeline({
  embeddingApiKey: process.env.OPENAI_API_KEY!,
});

rag.on("onIngestComplete", ({ documentId, chunkCount }) => {
  console.log(`[INGEST] ${documentId}: ${chunkCount} chunks indexed`);
});

rag.on("onQueryComplete", ({ query, sourceCount, confidence }) => {
  console.log(`[QUERY] "${query}" → ${sourceCount} sources, confidence=${confidence.toFixed(2)}`);
});

await rag.ingest(longDocument);
await rag.query("Summarize the key findings.");
```

## Separate embedding and completion providers
```typescript
const rag = new RagPipeline({
  embeddingApiKey: process.env.OPENAI_API_KEY!,
  embeddingModel: "text-embedding-3-large",
  embeddingBaseUrl: "https://api.openai.com/v1",
  completionApiKey: process.env.ANTHROPIC_PROXY_KEY!,
  completionModel: "gpt-4o",
  completionBaseUrl: "https://my-proxy.example.com/v1",
});

await rag.ingest(companyKnowledgeBase);
const result = await rag.query("How do I onboard a new employee?");
```

## Clearing and rebuilding the index
```typescript
const rag = new RagPipeline({
  embeddingApiKey: process.env.OPENAI_API_KEY!,
});

await rag.ingest(oldDocs);
console.log(`Index size: ${rag.getIndexSize()}`); // e.g. 150

rag.clearIndex();
console.log(`Index size: ${rag.getIndexSize()}`); // 0

await rag.ingest(updatedDocs);
const result = await rag.query("What changed in v2?");
```

---

## Python Examples

### Basic ingest and query
```python
import os
from rag_pipeline import RagPipeline, RagPipelineConfig

rag = RagPipeline(RagPipelineConfig(
    embedding_api_key=os.environ["OPENAI_API_KEY"],
))

rag.ingest("Our refund policy allows returns within 30 days...")
result = rag.query("Can I get a refund?")
print(result.answer)
print(f"Confidence: {result.confidence:.2f}")
```

### Multi-document with metadata
```python
rag.ingest(hr_text, metadata={"dept": "hr"})
rag.ingest(eng_text, metadata={"dept": "engineering"})

result = rag.query("What is the PTO policy?")
for source in result.sources:
    print(f"[{source['metadata']['dept']}] {source['score']:.3f}")
```

### Event handling
```python
rag.on("onIngestComplete", lambda e: print(f"Ingested {e['chunkCount']} chunks"))
rag.on("onQueryComplete", lambda e: print(f"Query confidence: {e['confidence']:.2f}"))

rag.ingest(large_document)
result = rag.query("Summarize the findings.")
```

### Clear and rebuild
```python
rag.ingest(old_docs)
print(f"Index: {rag.get_index_size()}")
rag.clear_index()
rag.ingest(new_docs)
```
