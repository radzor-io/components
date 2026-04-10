# How to integrate @radzor/ai-classifier

## Overview
Classifies text into user-defined categories using LLM-powered classification, rule-based keyword matching, or a hybrid approach. Supports single and batch classification, per-category confidence scores, trainable keyword extraction from labeled examples, and event-driven monitoring. Zero dependencies — uses native `fetch`.

## Integration Steps

### TypeScript

1. **Import and create an instance:**
```typescript
import { AiClassifier } from "@radzor/ai-classifier";

const classifier = new AiClassifier({
  apiKey: process.env.OPENAI_API_KEY!,
  mode: "llm", // "llm" | "rules" | "hybrid"
});
```

2. **Define categories:**
```typescript
classifier.defineCategory("technology", "Articles about software, hardware, AI, and tech industry", ["software", "programming", "AI", "machine learning"]);
classifier.defineCategory("sports", "Articles about athletic events, teams, and competitions", ["game", "championship", "player", "score"]);
classifier.defineCategory("finance", "Articles about markets, investing, and economics", ["market", "stock", "trading", "investment"]);
```

3. **Classify text:**
```typescript
const result = await classifier.classify("Apple releases new M4 MacBook Pro with groundbreaking AI capabilities");
console.log(result.category);   // "technology"
console.log(result.confidence); // 0.92
console.log(result.scores);    // { technology: 0.92, sports: 0.03, finance: 0.05 }
```

4. **Listen for classification events:**
```typescript
classifier.on("onClassified", ({ text, category, confidence, method }) => {
  console.log(`[${method}] "${text.slice(0, 40)}..." → ${category} (${confidence})`);
});
```

### Python

1. **Create and configure:**
```python
import os
from ai_classifier import AiClassifier, AiClassifierConfig

classifier = AiClassifier(AiClassifierConfig(
    api_key=os.environ["OPENAI_API_KEY"],
    mode="llm",
))
```

2. **Define categories and classify:**
```python
classifier.define_category("technology", "Tech articles", ["software", "AI"])
classifier.define_category("sports", "Sports articles", ["game", "team"])

result = classifier.classify("New AI model breaks benchmark records")
print(f"{result.category}: {result.confidence:.2f}")
```

## Environment Variables Required
- `OPENAI_API_KEY` — Required for `llm` and `hybrid` modes; not needed for `rules` mode

## Constraints
- LLM mode requires an OpenAI-compatible API key and network access
- Rules mode works offline but requires keyword definitions or training data
- Hybrid mode falls back to LLM when rule confidence is below 0.6
- Categories must be defined before classification

## Composability
Connections to other Radzor components will be defined in a separate pass.
