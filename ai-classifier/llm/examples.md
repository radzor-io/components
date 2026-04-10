# @radzor/ai-classifier — Usage Examples

## LLM-based classification
```typescript
import { AiClassifier } from "@radzor/ai-classifier";

const classifier = new AiClassifier({
  apiKey: process.env.OPENAI_API_KEY!,
  mode: "llm",
});

classifier.defineCategory("bug_report", "User reporting a software bug or error");
classifier.defineCategory("feature_request", "User requesting a new feature or improvement");
classifier.defineCategory("question", "User asking a question about how to use the product");
classifier.defineCategory("praise", "User expressing satisfaction or positive feedback");

const result = await classifier.classify("The app crashes whenever I try to upload a file larger than 10MB");
console.log(result.category);   // "bug_report"
console.log(result.confidence); // 0.95
console.log(result.method);     // "llm"
```

## Rule-based classification (no API key needed)
```typescript
const classifier = new AiClassifier({ mode: "rules" });

classifier.defineCategory("urgent", "Urgent support tickets", [
  "crash", "down", "broken", "emergency", "critical", "outage", "data loss"
]);
classifier.defineCategory("billing", "Billing related inquiries", [
  "invoice", "charge", "refund", "payment", "subscription", "pricing"
]);
classifier.defineCategory("general", "General inquiries", [
  "question", "help", "how to", "information"
]);

const result = await classifier.classify("The payment system is down and customers can't checkout");
console.log(result.category);   // "urgent"
console.log(result.confidence); // 0.67
console.log(result.method);     // "rules"
```

## Hybrid mode (rules first, LLM fallback)
```typescript
const classifier = new AiClassifier({
  apiKey: process.env.OPENAI_API_KEY!,
  mode: "hybrid",
});

classifier.defineCategory("spam", "Spam or unsolicited messages", [
  "buy now", "limited offer", "click here", "free money", "act now"
]);
classifier.defineCategory("legitimate", "Legitimate messages", [
  "meeting", "project", "update", "report", "review"
]);

// High keyword match → uses rules (no API call)
const spam = await classifier.classify("BUY NOW! Limited offer, click here for free money!");
console.log(spam.method); // "rules" — high confidence, no API call needed

// Low keyword match → falls back to LLM
const ambiguous = await classifier.classify("Can we schedule a discussion about the new pricing?");
console.log(ambiguous.method); // "llm" — rules weren't confident enough
```

## Batch classification
```typescript
const classifier = new AiClassifier({
  apiKey: process.env.OPENAI_API_KEY!,
  mode: "llm",
});

classifier.defineCategory("positive", "Positive sentiment");
classifier.defineCategory("negative", "Negative sentiment");
classifier.defineCategory("neutral", "Neutral or factual statement");

const reviews = [
  "Absolutely love this product! Best purchase ever.",
  "Terrible quality, broke after one week.",
  "Delivered on time, meets specifications.",
  "Would not recommend to anyone.",
];

const results = await classifier.batchClassify(reviews);
for (let i = 0; i < reviews.length; i++) {
  console.log(`"${reviews[i].slice(0, 40)}..." → ${results[i].category} (${results[i].confidence})`);
}
```

## Training from labeled examples
```typescript
const classifier = new AiClassifier({ mode: "rules" });

classifier.defineCategory("tech", "Technology topics");
classifier.defineCategory("sports", "Sports topics");
classifier.defineCategory("politics", "Political topics");

const trainResult = classifier.train([
  { text: "New AI model achieves state-of-the-art results on benchmarks", category: "tech" },
  { text: "Python 4.0 release brings major performance improvements", category: "tech" },
  { text: "Lakers win championship in overtime thriller", category: "sports" },
  { text: "World Cup qualifiers kick off this weekend", category: "sports" },
  { text: "Senate passes new infrastructure bill", category: "politics" },
  { text: "Election results show tight race in swing states", category: "politics" },
]);

console.log(`Updated ${trainResult.categoriesUpdated} categories, added ${trainResult.keywordsAdded} keywords`);

// Now classify using the trained keywords
const result = await classifier.classify("The new GPU delivers 2x performance gains for deep learning");
console.log(result.category); // "tech"
```

## Event-driven monitoring
```typescript
const classifier = new AiClassifier({
  apiKey: process.env.OPENAI_API_KEY!,
  mode: "hybrid",
});

classifier.defineCategory("safe", "Safe content");
classifier.defineCategory("unsafe", "Potentially unsafe content");

classifier.on("onClassified", ({ text, category, confidence, method }) => {
  if (category === "unsafe" && confidence > 0.8) {
    console.warn(`[ALERT] Unsafe content detected (${method}): "${text}"`);
  }
});

await classifier.classify(userMessage);
```

---

## Python Examples

### LLM classification
```python
import os
from ai_classifier import AiClassifier, AiClassifierConfig

classifier = AiClassifier(AiClassifierConfig(
    api_key=os.environ["OPENAI_API_KEY"],
    mode="llm",
))

classifier.define_category("bug_report", "Software bug reports")
classifier.define_category("feature_request", "Feature requests")
classifier.define_category("question", "Usage questions")

result = classifier.classify("The app crashes on startup")
print(f"{result.category}: {result.confidence:.2f}")  # bug_report: 0.94
```

### Rule-based classification
```python
classifier = AiClassifier(AiClassifierConfig(mode="rules"))
classifier.define_category("urgent", "Urgent issues", ["crash", "down", "broken"])
classifier.define_category("normal", "Normal inquiries", ["question", "help"])

result = classifier.classify("The server is down")
print(f"{result.category}: {result.confidence:.2f}")
```

### Training from examples
```python
classifier.train([
    {"text": "Server is not responding", "category": "urgent"},
    {"text": "How do I reset my password", "category": "normal"},
])

result = classifier.classify("API endpoint returning 500 errors")
print(result.category)  # "urgent"
```

### Batch classification
```python
texts = ["Great product!", "Terrible service.", "Arrived on time."]
results = classifier.batch_classify(texts)
for text, result in zip(texts, results):
    print(f"{text} → {result.category}")
```
